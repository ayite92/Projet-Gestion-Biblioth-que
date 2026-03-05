window.addEventListener('load', () => {
    setTimeout(() => {
        const loader = document.getElementById('loaderOverlay');
        if (loader) loader.classList.add('hidden');
    }, 700);
});

const STORAGE_SESSION_KEY = 'biblio_session_v1';
const STORAGE_SECTION_KEY = 'biblio_section_v1';
const STORAGE_RESERVATIONS_KEY = 'biblio_reservations_v1';
const STORAGE_NOTIFICATIONS_KEY = 'biblio_notifications_v1';
const STORAGE_THEME_KEY = 'biblio_theme_v1';
const SESSION_DUREE_MS = 5 * 60 * 60 * 1000;
const API_BASE = 'api';

const appState = {
    role: 'student',
    activeSection: 'dashboard',
    activeModal: null,
    unreadNotifications: 0,
    currentUser: null,
    livreSelectionne: null,
    livresCatalogue: [],
    livresCatalogueBdd: [],
    filtreCategorie: 'tous',
    rechercheLivre: '',
    rechercheGlobale: '',
    operationsEtudiant: [],
    notifications: [],
    reservations: [],
    reservationAConvertirId: null,
    etudiants: [],
    emprunts: [],
    parametresApplication: {
        dureeMaxEmpruntJours: 30,
        penaliteJournaliere: 1,
        quotaMaxEmpruntsActifs: 3
    },
    previousDashboardKpis: null,
    sessionExpireLe: null,
    loginTimeoutId: null,
    horlogeIntervalId: null
};

const sectionMap = {
    dashboard: 'dashboardSection',
    catalogue: 'catalogueSection',
    etudiants: 'etudiantsSection',
    reservations: 'reservationsSection',
    emprunts: 'empruntsSection',
    statistiques: 'statistiquesSection',
    notifications: 'notificationsSection',
    parametres: 'parametresSection'
};

// Point d'entrée: initialise l'interface, les événements et les données.
async function initApp() {
    appliquerThemeInitial();
    initAuth();
    initialiserCatalogueLivres();
    bindSidebar();
    bindNavigation();
    bindTopbar();
    bindSearch();
    bindChips();
    bindModals();
    bindActions();
    setDefaultDates();
    animateCounters();
    buildChart('chartBars');
    buildChart('chartBarsStats');
    chargerNotificationsPersistantes();
    renderNotifications();
    updateNotificationBadge();
    renderLivresFiltres();
    chargerReservationsPersistantes();
    renderReservationsAdmin();
    demarrerHorlogeConnexion();

    const session = chargerSessionPersistante();
    if (session) {
        const sessionServeur = await verifierSessionServeur();
        if (!sessionServeur) {
            forceReauthentication();
            return;
        }
        restaurerSession(session);
        const utilisateurServeur = sessionServeur.utilisateur || {};
        appState.currentUser = {
            name: utilisateurServeur.nom_complet || appState.currentUser?.name || 'Étudiant',
            email: utilisateurServeur.email || appState.currentUser?.email || '',
            roleNom: utilisateurServeur.role_nom || appState.currentUser?.roleNom || 'etudiant'
        };
        appState.role = sessionServeur.acces_admin_valide ? 'admin' : 'student';
        entrerDansApplication({ afficherBienvenue: false });
        return;
    }

    showAuth();
}

// Branche les formulaires de connexion/inscription et les onglets d'auth.
function initAuth() {
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');

    document.querySelectorAll('[data-auth-tab]').forEach(tab => {
        tab.addEventListener('click', () => switchAuthTab(tab.getAttribute('data-auth-tab')));
    });

    if (loginForm) {
        loginForm.addEventListener('submit', event => {
            event.preventDefault();
            handleLogin();
        });
    }

    if (registerForm) {
        registerForm.addEventListener('submit', event => {
            event.preventDefault();
            handleRegister();
        });
    }
}

function switchAuthTab(tabName) {
    const isLogin = tabName === 'login';

    document.querySelectorAll('[data-auth-tab]').forEach(tab => {
        tab.classList.toggle('active', tab.getAttribute('data-auth-tab') === tabName);
    });

    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    if (loginForm) loginForm.classList.toggle('active', isLogin);
    if (registerForm) registerForm.classList.toggle('active', !isLogin);
}

// Crée un compte adhérent (étudiant ou enseignant) via l'API.
async function handleRegister() {
    const nameInput = document.getElementById('registerName');
    const memberTypeInput = document.getElementById('registerMemberType');
    const emailInput = document.getElementById('registerEmail');
    const departmentInput = document.getElementById('registerDepartment');
    const levelInput = document.getElementById('registerLevel');
    const passwordInput = document.getElementById('registerPassword');

    if (!nameInput || !memberTypeInput || !emailInput || !departmentInput || !levelInput || !passwordInput) return;

    const rawName = nameInput.value.trim();
    const typeAdherent = memberTypeInput.value === 'enseignant' ? 'enseignant' : 'etudiant';
    const email = emailInput.value.trim().toLowerCase();
    const filiere = departmentInput.value.trim();
    const niveau = levelInput.value.trim();
    const password = passwordInput.value;
    const name = rawName || email.split('@')[0] || (typeAdherent === 'enseignant' ? 'Enseignant' : 'Étudiant');

    if (!email || !password || !filiere || !niveau) {
        showToast('Inscription', 'Tous les champs sont obligatoires.');
        return;
    }

    let reponse = null;
    try {
        reponse = await apiJson(`${API_BASE}/inscription.php`, {
            method: 'POST',
            body: JSON.stringify({
                nom_complet: name,
                email,
                mot_de_passe: password,
                type_adherent: typeAdherent,
                filiere,
                niveau
            })
        });
    } catch (error) {
        showToast('Inscription', error.message);
        return;
    }

    nameInput.value = '';
    memberTypeInput.value = 'etudiant';
    emailInput.value = '';
    departmentInput.value = '';
    levelInput.value = '';
    passwordInput.value = '';

    const typeLabel = typeAdherent === 'enseignant' ? 'Enseignant' : 'Étudiant';
    ajouterNotificationLocale('Nouvelle inscription', `${typeLabel} inscrit: ${name}.`);
    const matriculeCree = reponse?.utilisateur?.matricule || 'auto-généré';
    showToast('Inscription réussie', `Compte adhérent enregistré (${matriculeCree}). Tu peux te connecter.`);
    switchAuthTab('login');
}

// Authentifie l'utilisateur puis démarre sa session applicative.
async function handleLogin() {
    const emailInput = document.getElementById('loginEmail');
    const passwordInput = document.getElementById('loginPassword');

    if (!emailInput || !passwordInput) return;

    const email = emailInput.value.trim().toLowerCase();
    const password = passwordInput.value;

    let data = null;
    try {
        data = await apiJson(`${API_BASE}/connexion.php`, {
            method: 'POST',
            body: JSON.stringify({
                email,
                mot_de_passe: password
            })
        });
    } catch (error) {
        showToast('Connexion refusée', error.message);
        return;
    }

    const user = data.utilisateur || {};
    appState.currentUser = {
        name: user.nom_complet || email.split('@')[0] || 'Étudiant',
        email: user.email || email,
        roleNom: user.role_nom || 'etudiant'
    };
    appState.role = user.acces_admin_valide ? 'admin' : 'student';
    appState.sessionExpireLe = Date.now() + SESSION_DUREE_MS;
    enregistrerSessionPersistante();

    emailInput.value = '';
    passwordInput.value = '';

    entrerDansApplication({ afficherBienvenue: true });
}

function entrerDansApplication(options = {}) {
    const afficherBienvenue = options.afficherBienvenue === true;

    if (afficherBienvenue) {
        afficherBienvenuePuisOuvrir();
        return;
    }
    finaliserEntreeApplication();
}

function finaliserEntreeApplication() {
    showApplication();
    const session = chargerSessionPersistante();
    const role = session?.role === 'admin' ? 'admin' : 'student';
    setRole(role, { silent: true });
    updateUserIdentity();
    initialiserOperationsEtudiant();
    renderOperationsEtudiant();

    const sectionSauvegardee = session?.section || localStorage.getItem(STORAGE_SECTION_KEY) || 'dashboard';
    const hash = window.location.hash.replace('#', '').trim();
    if (hash && sectionMap[hash]) {
        openSection(hash);
    } else if (sectionMap[sectionSauvegardee]) {
        openSection(sectionSauvegardee);
    } else {
        openSection('dashboard');
    }

    chargerLivresDepuisApi();
    chargerEtudiantsDepuisApi();
    chargerEmpruntsDepuisApi();
    chargerParametresApplication();
    chargerNotificationsDepuisApi();
}

function afficherBienvenuePuisOuvrir() {
    const overlay = document.getElementById('loginSuccessOverlay');
    const title = document.getElementById('loginSuccessTitle');
    const nom = appState.currentUser?.name || 'Utilisateur';

    if (title) title.textContent = `Bienvenue ${nom}`;
    if (overlay) overlay.classList.remove('hidden');

    if (appState.loginTimeoutId) {
        clearTimeout(appState.loginTimeoutId);
    }

    appState.loginTimeoutId = setTimeout(() => {
        if (overlay) overlay.classList.add('hidden');
        finaliserEntreeApplication();
        showToast('Connexion réussie', `Bienvenue ${nom}.`);
    }, 3000);
}

function showAuth() {
    const auth = document.getElementById('authGateway');
    const shell = document.getElementById('appShell');
    const overlay = document.getElementById('loginSuccessOverlay');
    if (auth) auth.classList.remove('hidden');
    if (shell) shell.classList.add('hidden');
    if (overlay) overlay.classList.add('hidden');
}

function showApplication() {
    const auth = document.getElementById('authGateway');
    const shell = document.getElementById('appShell');
    const overlay = document.getElementById('loginSuccessOverlay');
    if (auth) auth.classList.add('hidden');
    if (shell) shell.classList.remove('hidden');
    if (overlay) overlay.classList.add('hidden');
}

async function logout() {
    try {
        await apiJson(`${API_BASE}/deconnexion.php`, { method: 'POST' });
    } catch (error) {
        // on nettoie localement même si la session serveur est déjà expirée
    }
    forceReauthentication();
    showToast('Déconnexion', 'Session fermée avec succès.');
}

function forceReauthentication() {
    appState.currentUser = null;
    appState.livreSelectionne = null;
    appState.operationsEtudiant = [];
    appState.sessionExpireLe = null;
    if (appState.loginTimeoutId) {
        clearTimeout(appState.loginTimeoutId);
        appState.loginTimeoutId = null;
    }
    supprimerSessionPersistante();
    localStorage.removeItem(STORAGE_SECTION_KEY);
    setRole('student', { silent: true, skipDataRefresh: true });
    closeAllModals();
    showAuth();
    switchAuthTab('login');
}

function updateUserIdentity() {
    const fallback = { name: 'Espace adhérent', email: '' };
    const user = appState.currentUser || fallback;
    const initials = getInitials(user.name);

    const userName = document.getElementById('userDisplayName');
    const userInitials = document.getElementById('userInitials');

    if (userName) userName.textContent = user.name;
    if (userInitials) userInitials.textContent = initials;
    mettreAJourTexteBienvenueRole();
    appliquerParametresCompteDansFormulaire();
}

function libelleRoleInterface() {
    if (appState.role === 'admin') return 'Administrateur';
    const roleNom = normaliserTexte(appState.currentUser?.roleNom || 'etudiant');
    return roleNom.includes('enseign') ? 'Enseignant' : 'Étudiant';
}

function construireTexteBienvenueRole() {
    const roleLabel = libelleRoleInterface();
    if (appState.role === 'admin') return roleLabel;

    const nomUtilisateur = String(appState.currentUser?.name || '').trim();
    return nomUtilisateur ? `${roleLabel} ${nomUtilisateur}` : roleLabel;
}

function mettreAJourTexteBienvenueRole() {
    const welcomeRole = document.getElementById('welcomeRole');
    if (!welcomeRole) return;
    welcomeRole.textContent = construireTexteBienvenueRole();
}

function mettreAJourDescriptionHeroSelonRole() {
    const heroDescription = document.getElementById('heroRoleDescription');
    if (!heroDescription) return;
    heroDescription.textContent = appState.role === 'admin'
        ? 'Gérez le catalogue, les adhérents et les emprunts depuis votre espace administrateur.'
        : 'Consultez le catalogue, réservez des livres et suivez vos emprunts depuis votre espace adhérent.';
}

function getInitials(name) {
    const parts = String(name).trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return 'ET';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function appliquerParametresCompteDansFormulaire() {
    const settingsName = document.getElementById('settingsName');
    const settingsEmail = document.getElementById('settingsEmail');
    const settingsLoanDays = document.getElementById('settingsLoanDays');
    const settingsPenalty = document.getElementById('settingsPenalty');
    const settingsLoanQuota = document.getElementById('settingsLoanQuota');
    const loanMaxDaysLabel = document.getElementById('loanMaxDaysLabel');

    const utilisateur = appState.currentUser || {};
    if (settingsName) settingsName.value = utilisateur.name || '';
    if (settingsEmail) settingsEmail.value = utilisateur.email || '';

    const dureeMax = Number(appState.parametresApplication?.dureeMaxEmpruntJours || 30);
    const penaliteJour = Number(appState.parametresApplication?.penaliteJournaliere || 1);
    const quotaMax = Number(appState.parametresApplication?.quotaMaxEmpruntsActifs || 3);

    if (settingsLoanDays) {
        const dureeEmprunt = determinerDureeEmpruntAffichage();
        settingsLoanDays.value = dureeEmprunt === null ? '' : String(dureeEmprunt);
        settingsLoanDays.placeholder = dureeEmprunt === null ? 'Durée variable / aucun emprunt' : '';
    }
    if (loanMaxDaysLabel) loanMaxDaysLabel.textContent = ` ${dureeMax} jours`;

    if (settingsPenalty) {
        const penaliteAffichee = calculerPenaliteAfficheePourUtilisateur(penaliteJour);
        settingsPenalty.value = String(penaliteAffichee);
    }
    if (settingsLoanQuota) {
        settingsLoanQuota.value = String(quotaMax);
    }
}

function determinerDureeEmpruntAffichage() {
    const operations = Array.isArray(appState.operationsEtudiant) ? appState.operationsEtudiant : [];
    const durees = operations
        .filter(operation => operation?.dateEmprunt && operation?.dateRetourPrevue)
        .map(operation => {
            const debut = new Date(`${operation.dateEmprunt}T00:00:00`);
            const fin = new Date(`${operation.dateRetourPrevue}T00:00:00`);
            if (Number.isNaN(debut.getTime()) || Number.isNaN(fin.getTime())) return null;
            return Math.max(0, Math.round((fin - debut) / 86400000));
        })
        .filter(valeur => Number.isInteger(valeur) && valeur >= 0);

    if (!durees.length) return null;
    const premiere = durees[0];
    const toutesEgales = durees.every(valeur => valeur === premiere);
    return toutesEgales ? premiere : null;
}

function calculerPenaliteAfficheePourUtilisateur(penaliteJour) {
    if (appState.role === 'admin') {
        return Number(penaliteJour.toFixed(2));
    }

    const operations = Array.isArray(appState.operationsEtudiant) ? appState.operationsEtudiant : [];
    const enRetard = operations.some(operation => {
        if (!operation?.dateRetourPrevue || operation?.dateRetourEffective) return false;
        const prevue = new Date(`${operation.dateRetourPrevue}T00:00:00`);
        const today = new Date(`${formaterIso(new Date())}T00:00:00`);
        if (Number.isNaN(prevue.getTime())) return false;
        return prevue < today;
    });

    return Number((enRetard ? penaliteJour : 0).toFixed(2));
}

function bindSidebar() {
    const menuToggle = document.getElementById('menuToggle');
    const overlay = document.getElementById('sidebarOverlay');
    if (menuToggle) menuToggle.addEventListener('click', openSidebar);
    if (overlay) overlay.addEventListener('click', closeSidebar);

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) logoutBtn.addEventListener('click', logout);
}

function openSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    if (sidebar) sidebar.classList.add('open');
    if (overlay) overlay.classList.add('active');
}

function closeSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    if (sidebar) sidebar.classList.remove('open');
    if (overlay) overlay.classList.remove('active');
}

function bindNavigation() {
    document.querySelectorAll('[data-section-link]').forEach(link => {
        link.addEventListener('click', event => {
            event.preventDefault();
            const section = link.getAttribute('data-section-link');
            openSection(section);
        });
    });
}

function openSection(sectionKey) {
    const sectionId = sectionMap[sectionKey];
    if (!sectionId) return;

    document.querySelectorAll('.app-section').forEach(section => {
        section.classList.remove('active');
    });

    const next = document.getElementById(sectionId);
    if (next) next.classList.add('active');

    document.querySelectorAll('.sidebar-nav [data-section-link]').forEach(link => {
        link.classList.toggle('active', link.getAttribute('data-section-link') === sectionKey);
    });

    appState.activeSection = sectionKey;
    window.location.hash = sectionKey;
    localStorage.setItem(STORAGE_SECTION_KEY, sectionKey);
    enregistrerSessionPersistante();
    rafraichirDonneesSection(sectionKey);
    closeSidebar();
}

function rafraichirDonneesSection(sectionKey) {
    if (sectionKey === 'dashboard' || sectionKey === 'catalogue') {
        chargerLivresDepuisApi();
    }

    if (sectionKey === 'dashboard' || sectionKey === 'etudiants' || sectionKey === 'reservations' || sectionKey === 'emprunts') {
        chargerEtudiantsDepuisApi();
        chargerEmpruntsDepuisApi();
    }
    if (sectionKey === 'reservations') {
        renderReservationsAdmin();
    }
}

function bindTopbar() {
    const themeToggleBtn = document.getElementById('themeToggleBtn');
    const notifBtn = document.getElementById('topbarNotifBtn');
    const msgBtn = document.getElementById('topbarMsgBtn');
    const loanBtn = document.getElementById('openLoanBtn');
    const adminAccessBtn = document.getElementById('adminAccessBtn');
    const studentBackBtn = document.getElementById('studentBackBtn');
    const addBookBtn = document.getElementById('addBookBtn');

    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', () => {
            basculerTheme();
        });
    }

    if (notifBtn) {
        notifBtn.addEventListener('click', () => {
            openSection('notifications');
        });
    }

    if (msgBtn) {
        msgBtn.addEventListener('click', () => {
            openSection('notifications');
        });
    }

    if (loanBtn) {
        loanBtn.addEventListener('click', () => {
            if (!ensureAdminAction()) return;
            openModal('loan');
        });
    }

    if (adminAccessBtn) {
        adminAccessBtn.addEventListener('click', () => {
            openModal('adminVerify');
        });
    }

    if (studentBackBtn) {
        studentBackBtn.addEventListener('click', () => {
            setRole('student');
        });
    }

    if (addBookBtn) {
        addBookBtn.addEventListener('click', () => {
            if (!ensureAdminAction()) return;
            openModal('bookAdd');
        });
    }
}

function themePrefereUtilisateur() {
    const themeSauvegarde = String(localStorage.getItem(STORAGE_THEME_KEY) || '').trim();
    if (themeSauvegarde === 'dark' || themeSauvegarde === 'light') return themeSauvegarde;

    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        return 'dark';
    }
    return 'light';
}

function appliquerTheme(theme) {
    const themeFinal = theme === 'dark' ? 'dark' : 'light';
    document.body.setAttribute('data-theme', themeFinal);
    localStorage.setItem(STORAGE_THEME_KEY, themeFinal);
    synchroniserBoutonTheme(themeFinal);
}

function appliquerThemeInitial() {
    appliquerTheme(themePrefereUtilisateur());
}

function basculerTheme() {
    const themeActuel = document.body.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    appliquerTheme(themeActuel === 'dark' ? 'light' : 'dark');
}

function synchroniserBoutonTheme(theme) {
    const themeToggleBtn = document.getElementById('themeToggleBtn');
    if (!themeToggleBtn) return;

    const icon = themeToggleBtn.querySelector('i');
    const sombre = theme === 'dark';
    if (icon) {
        icon.className = sombre ? 'fas fa-sun' : 'fas fa-moon';
    }
    themeToggleBtn.title = sombre ? 'Activer le mode clair' : 'Activer le mode nuit';
    themeToggleBtn.setAttribute('aria-pressed', sombre ? 'true' : 'false');
}

// Applique le rôle actif (admin/student) dans toute l'UI.
function setRole(role, options = {}) {
    const silent = Boolean(options.silent);
    const skipDataRefresh = Boolean(options.skipDataRefresh);
    const rolePrecedent = appState.role;
    appState.role = role === 'admin' ? 'admin' : 'student';
    document.body.setAttribute('data-role', appState.role);

    const isAdmin = appState.role === 'admin';
    const roleLabel = libelleRoleInterface();
    const rolePill = document.getElementById('rolePill');
    const userRole = document.getElementById('userDisplayRole');
    const adminAccessBtn = document.getElementById('adminAccessBtn');
    const studentBackBtn = document.getElementById('studentBackBtn');

    if (rolePill) rolePill.textContent = isAdmin ? 'Espace administrateur' : 'Espace adhérent';
    if (userRole) userRole.textContent = roleLabel;
    mettreAJourTexteBienvenueRole();
    mettreAJourDescriptionHeroSelonRole();

    if (adminAccessBtn) adminAccessBtn.classList.toggle('hidden', isAdmin);
    if (studentBackBtn) studentBackBtn.classList.toggle('hidden', !isAdmin);

    appliquerEtatElementsAdmin();

    document.querySelectorAll('[data-student-only="true"]').forEach(el => {
        el.classList.toggle('hidden', isAdmin);
    });
    renderOperationsEtudiant();
    renderReservationsAdmin();
    enregistrerSessionPersistante();
    const sessionActive = Boolean(appState.currentUser);
    if (!skipDataRefresh && sessionActive) {
        chargerEtudiantsDepuisApi();
        chargerEmpruntsDepuisApi();
    }

    if (!silent) {
        showToast('Rôle actif', isAdmin ? 'Accès administrateur validé.' : 'Retour à l\'espace étudiant.');
    }

    if (rolePrecedent === 'admin' && appState.role === 'student') {
        apiJson(`${API_BASE}/retour_mode_etudiant.php`, { method: 'POST' }).catch(() => {});
    }
}

// Met à jour l'état des éléments réservés à l'administrateur.
function appliquerEtatElementsAdmin() {
    const isAdmin = appState.role === 'admin';
    document.querySelectorAll('[data-admin-only="true"]').forEach(el => {
        const estBouton = el instanceof HTMLButtonElement;
        if ('disabled' in el) {
            // Les boutons restent cliquables pour afficher un message explicite.
            el.disabled = estBouton ? false : !isAdmin;
        }
        el.classList.toggle('admin-disabled', !isAdmin);
    });
}

function ensureAdminAction() {
    if (appState.role === 'admin') return true;
    showToast('Accès refusé', 'Action réservée à l\'administrateur.');
    return false;
}

function bindSearch() {
    const advSearch = document.getElementById('advSearch');
    const advSearchBtn = document.getElementById('advSearchBtn');
    const quickSearch = document.getElementById('quickSearch');

    if (advSearchBtn) advSearchBtn.addEventListener('click', handleSearch);

    if (advSearch) {
        advSearch.addEventListener('keydown', e => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleSearch();
            }
        });
    }

    if (quickSearch) {
        quickSearch.addEventListener('keydown', e => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            appliquerRechercheTransversale(e.target.value.trim(), 'rapide');
        });
    }
}

function handleSearch() {
    const input = document.getElementById('advSearch');
    const query = input ? input.value.trim() : '';
    appliquerRechercheTransversale(query, 'avancee');
}

function appliquerRechercheTransversale(query, source) {
    appState.rechercheGlobale = query;

    const quickSearch = document.getElementById('quickSearch');
    const advSearch = document.getElementById('advSearch');
    if (quickSearch && quickSearch.value !== query) quickSearch.value = query;
    if (advSearch && advSearch.value !== query) advSearch.value = query;

    if (appState.activeSection === 'etudiants') {
        if (!query) {
            chargerEtudiantsDepuisApi();
        }
        renderEtudiantsTable();
        showToast(
            source === 'rapide' ? 'Recherche rapide' : 'Recherche',
            query ? `Étudiants filtrés pour : « ${query} »` : 'Liste des étudiants réinitialisée.'
        );
        return;
    }

    if (appState.activeSection === 'emprunts') {
        if (!query) {
            chargerEmpruntsDepuisApi();
        }
        renderTableauxEmprunts();
        showToast(
            source === 'rapide' ? 'Recherche rapide' : 'Recherche',
            query ? `Emprunts filtrés pour : « ${query} »` : 'Liste des emprunts réinitialisée.'
        );
        return;
    }

    if (appState.activeSection === 'catalogue' || appState.activeSection === 'dashboard') {
        appState.rechercheLivre = query;
        if (!query) {
            appliquerFiltreCategorie('tous');
        }
        renderLivresFiltres();
        showToast(
            source === 'rapide' ? 'Recherche rapide' : 'Recherche',
            query ? `Résultats filtrés pour : « ${query} »` : 'Filtre de recherche réinitialisé.'
        );
        return;
    }

    showToast(
        source === 'rapide' ? 'Recherche rapide' : 'Recherche',
        'Recherche non activée pour cette section.'
    );
}

function appliquerFiltreCategorie(categorie) {
    appState.filtreCategorie = categorie || 'tous';
    document.querySelectorAll('.chip').forEach(chip => {
        chip.classList.toggle('active', chip.getAttribute('data-category') === appState.filtreCategorie);
    });
}

function bindChips() {
    document.querySelectorAll('.chip').forEach(chip => {
        chip.addEventListener('click', () => {
            appliquerFiltreCategorie(chip.getAttribute('data-category') || 'tous');
            renderLivresFiltres();
            showToast('Filtre appliqué', chip.textContent.trim());
        });
    });
}

function bindModals() {
    document.addEventListener('click', event => {
        const trigger = event.target.closest('[data-open-modal]');
        if (!trigger) return;

        const modalId = trigger.getAttribute('data-open-modal');
        if (modalId === 'loan' && !ensureAdminAction()) return;
        if (modalId === 'bookDetail') {
            const bookId = Number(trigger.getAttribute('data-book-id'));
            const livre = appState.livresCatalogue.find(item => item.id === bookId) || null;
            appState.livreSelectionne = livre;
            if (livre) remplirModalLivre(livre);
        }
        openModal(modalId);
    });

    document.querySelectorAll('[data-close-modal]').forEach(trigger => {
        trigger.addEventListener('click', () => {
            closeModal(trigger.getAttribute('data-close-modal'));
        });
    });

    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', event => {
            if (event.target !== overlay) return;
            overlay.classList.remove('open');
            appState.activeModal = null;
        });
    });

    document.addEventListener('keydown', event => {
        if (event.key !== 'Escape' || !appState.activeModal) return;
        closeModal(appState.activeModal);
    });

    const submitLoanBtn = document.getElementById('submitLoanBtn');
    if (submitLoanBtn) submitLoanBtn.addEventListener('click', submitLoan);

    const reserveBookBtn = document.getElementById('reserveBookBtn');
    if (reserveBookBtn) {
        reserveBookBtn.addEventListener('click', () => {
            const livre = appState.livreSelectionne || null;
            const stock = Number(livre?.stock || 0);
            const titre = livre?.titre || "Introduction à l'algorithmique";

            if (stock > 0) {
                showToast('Réservation refusée', 'Ce livre est déjà disponible. Utilise directement un emprunt.');
                return;
            }

            ajouterOperationReservation(titre);
            ajouterReservationPourAdmin(titre);
            publierNotificationServeur(
                'Nouvelle réservation',
                `${appState.currentUser?.name || 'Un adhérent'} a réservé: ${titre}.`,
                'alerte'
            );
            showToast('Réservation confirmée', `${titre} est réservé en attente de retour.`);
            closeModal('bookDetail');
        });
    }

    const requestLoanBtn = document.getElementById('requestLoanBtn');
    if (requestLoanBtn) {
        requestLoanBtn.addEventListener('click', () => {
            const livre = appState.livreSelectionne || null;
            const titre = String(livre?.titre || '').trim();
            const stock = Number(livre?.stock || 0);

            if (!titre) {
                showToast('Demande refusée', 'Livre introuvable.');
                return;
            }

            if (stock <= 0) {
                showToast('Demande refusée', 'Livre indisponible. Utilise le bouton Réserver.');
                return;
            }

            const ajoute = ajouterDemandeEmpruntPourAdmin(titre);
            if (!ajoute) {
                showToast('Demande déjà envoyée', 'Une demande d\'emprunt est déjà en attente pour ce livre.');
                return;
            }

            const messageDemande = `${appState.currentUser?.name || 'Un adhérent'} a demandé un emprunt: ${titre}.`;
            ajouterNotificationLocale('Demande d\'emprunt', messageDemande);
            publierNotificationServeur('Demande d\'emprunt', messageDemande, 'info');
            showToast('Demande envoyée', `${titre} a été ajouté aux emprunts à valider.`);
            closeModal('bookDetail');
        });
    }

    const verifyAdminBtn = document.getElementById('verifyAdminBtn');
    if (verifyAdminBtn) verifyAdminBtn.addEventListener('click', verifyAdminAccess);

    const loanViewAllBooksBtn = document.getElementById('loanViewAllBooksBtn');
    if (loanViewAllBooksBtn) {
        loanViewAllBooksBtn.addEventListener('click', async () => {
            await chargerLivresDepuisApi();
            closeModal('loan');
            afficherCatalogueLivresDisponiblesBase();
        });
    }

    const submitStudentBtn = document.getElementById('submitStudentBtn');
    if (submitStudentBtn) submitStudentBtn.addEventListener('click', submitStudent);

    const submitBookBtn = document.getElementById('submitBookBtn');
    if (submitBookBtn) submitBookBtn.addEventListener('click', submitBook);
}

function openModal(id) {
    const map = {
        loan: 'modalLoan',
        bookDetail: 'modalBookDetail',
        adminVerify: 'modalAdminVerify',
        studentAdd: 'modalStudentAdd',
        bookAdd: 'modalBookAdd',
        devTeam: 'modalDevTeam'
    };
    const modal = document.getElementById(map[id]);
    if (!modal) return;
    modal.classList.add('open');
    appState.activeModal = id;
}

function closeModal(id) {
    const map = {
        loan: 'modalLoan',
        bookDetail: 'modalBookDetail',
        adminVerify: 'modalAdminVerify',
        studentAdd: 'modalStudentAdd',
        bookAdd: 'modalBookAdd',
        devTeam: 'modalDevTeam'
    };
    const modal = document.getElementById(map[id]);
    if (!modal) return;
    modal.classList.remove('open');
    appState.activeModal = null;
    if (id === 'loan') {
        appState.reservationAConvertirId = null;
        masquerInfoReservationEmprunt();
    }
}

function closeAllModals() {
    document.querySelectorAll('.modal-overlay').forEach(modal => modal.classList.remove('open'));
    appState.activeModal = null;
    masquerInfoReservationEmprunt();
}

async function verifyAdminAccess() {
    const identifier = document.getElementById('adminIdentifier');
    const password = document.getElementById('adminPassword');
    const code = document.getElementById('adminSecurityCode');

    if (!identifier || !password || !code) return;

    let data = null;
    try {
        data = await apiJson(`${API_BASE}/verifier_acces_admin.php`, {
            method: 'POST',
            body: JSON.stringify({
                identifiant_admin: identifier.value.trim(),
                mot_de_passe_admin: password.value,
                code_securite: code.value.trim().toUpperCase()
            })
        });
    } catch (error) {
        showToast('Vérification refusée', error.message);
        return;
    }

    const admin = data?.administrateur || null;
    if (admin) {
        appState.currentUser = {
            ...(appState.currentUser || {}),
            name: String(admin.nom_complet || appState.currentUser?.name || 'Administrateur'),
            email: String(admin.email || appState.currentUser?.email || ''),
            roleNom: 'administrateur'
        };
    }
    setRole('admin');
    updateUserIdentity();
    closeModal('adminVerify');
    identifier.value = '';
    password.value = '';
    code.value = '';
}

function trouverLivreBddCorrespondant(livreCatalogue, livresBdd = appState.livresCatalogueBdd) {
    if (!livreCatalogue) return null;
    const isbnRecherche = normaliserTexte(livreCatalogue.isbn || '');
    const titreRecherche = normaliserTexte(livreCatalogue.titre || '');
    return (Array.isArray(livresBdd) ? livresBdd : []).find(item => {
        const isbnBdd = normaliserTexte(item.isbn || '');
        const titreBdd = normaliserTexte(item.titre || '');
        return (isbnRecherche && isbnRecherche === isbnBdd)
            || (titreRecherche && titreRecherche === titreBdd);
    }) || null;
}

async function synchroniserLivreCatalogueEnBase(livreCatalogue) {
    const stock = Math.max(1, Number(livreCatalogue?.stock || 1));
    const isbnSource = String(livreCatalogue?.isbn || '').trim();
    const isbn = isbnSource || `LOC${Date.now().toString().slice(-10)}`;

    const data = await apiJson(`${API_BASE}/livres_ajouter.php`, {
        method: 'POST',
        body: JSON.stringify({
            isbn,
            titre: String(livreCatalogue?.titre || 'Livre'),
            auteur: String(livreCatalogue?.auteur || 'Auteur inconnu'),
            editeur: String(livreCatalogue?.editeur || ''),
            annee_publication: Number(livreCatalogue?.annee || 0) || null,
            categorie_id: null,
            nombre_total_exemplaires: stock,
            nombre_exemplaires_disponibles: stock,
            code_emplacement: String(livreCatalogue?.emplacement || '')
        })
    });

    const livreId = Number(data?.livre_id || 0);
    return Number.isInteger(livreId) && livreId > 0 ? livreId : 0;
}

// Valide et enregistre un emprunt depuis la modale "Nouvel emprunt".
async function submitLoan() {
    if (!ensureAdminAction()) return;

    const student = document.getElementById('loanStudentSelect');
    const book = document.getElementById('loanBookSelect');
    const start = document.getElementById('loanDateStart');
    const end = document.getElementById('loanDateEnd');

    if (!student || !book || !start || !end) return;

    if (!student.value || !book.value || !start.value || !end.value) {
        showToast('Champs manquants', 'Complète tous les champs du formulaire.');
        return;
    }

    if (end.value < start.value) {
        showToast('Date invalide', 'La date de retour doit être après la date d\'emprunt.');
        return;
    }

    const etudiantId = Number(student.value);
    const bookValue = String(book.value || '').trim();
    const livresCatalogue = Array.isArray(appState.livresCatalogue) ? appState.livresCatalogue : [];
    const livresBdd = Array.isArray(appState.livresCatalogueBdd) ? appState.livresCatalogueBdd : [];

    let livreId = 0;
    let livreSelection = null;
    let livreCatalogueSansCorrespondanceBdd = false;

    if (bookValue.startsWith('db:')) {
        livreId = Number(bookValue.slice(3));
        livreSelection = livresBdd.find(item => Number(item.id) === livreId) || null;
    } else if (bookValue.startsWith('cat:')) {
        const livreCatalogueId = Number(bookValue.slice(4));
        livreSelection = livresCatalogue.find(item => Number(item.id) === livreCatalogueId) || null;
        const livreBddCorrespondant = trouverLivreBddCorrespondant(livreSelection, livresBdd);
        if (livreBddCorrespondant) {
            livreId = Number(livreBddCorrespondant.id);
            livreSelection = livreBddCorrespondant;
        } else {
            livreCatalogueSansCorrespondanceBdd = Boolean(livreSelection);
        }
    } else {
        livreId = Number(bookValue);
        livreSelection = livresBdd.find(item => Number(item.id) === livreId) || null;
    }

    let livreBdd = livresBdd.find(item => Number(item.id) === livreId);

    if (!Number.isInteger(etudiantId) || etudiantId <= 0) {
        showToast('Donnée invalide', 'Sélectionne un étudiant valide.');
        return;
    }
    if (!Number.isInteger(livreId) || livreId <= 0) {
        if (livreCatalogueSansCorrespondanceBdd) {
            try {
                const idCree = await synchroniserLivreCatalogueEnBase(livreSelection);
                await chargerLivresDepuisApi();
                livreId = idCree;
                livreBdd = appState.livresCatalogueBdd.find(item => Number(item.id) === livreId) || trouverLivreBddCorrespondant(livreSelection);
            } catch (error) {
                await chargerLivresDepuisApi();
                livreBdd = trouverLivreBddCorrespondant(livreSelection);
                if (livreBdd) {
                    livreId = Number(livreBdd.id);
                } else {
                    showToast('Emprunt refusé', error.message || 'Impossible de synchroniser ce livre en base.');
                    return;
                }
            }
        }
        if (!Number.isInteger(livreId) || livreId <= 0) {
            showToast('Donnée invalide', 'Sélectionne un livre valide.');
            return;
        }
    }
    if (!livreBdd) {
        const livreBddRecharge = trouverLivreBddCorrespondant(livreSelection);
        if (livreBddRecharge) {
            livreBdd = livreBddRecharge;
            livreId = Number(livreBddRecharge.id);
        } else {
            showToast('Emprunt refusé', 'Impossible de retrouver ce livre en base.');
            await chargerLivresDepuisApi();
            return;
        }
    }

    let reponse = null;
    try {
        reponse = await apiJson(`${API_BASE}/emprunts_ajouter.php`, {
            method: 'POST',
            body: JSON.stringify({
                etudiant_id: etudiantId,
                livre_id: livreId,
                date_emprunt: start.value,
                date_retour_prevue: end.value
            })
        });
    } catch (error) {
        showToast('Emprunt refusé', error.message);
        return;
    }

    const titreLivre = reponse?.emprunt?.titre_livre || livreSelection?.titre || book.options[book.selectedIndex]?.text || 'Livre';

    await chargerLivresDepuisApi();
    await chargerEmpruntsDepuisApi();
    if (appState.reservationAConvertirId) {
        appState.reservations = appState.reservations.filter(item => item.id !== appState.reservationAConvertirId);
        appState.reservationAConvertirId = null;
        enregistrerReservationsPersistantes();
        renderReservationsAdmin();
        renderTableauxEmprunts();
    }
    closeModal('loan');
    const nomEtudiant = student.options[student.selectedIndex]?.text.split('—')[0].trim() || 'Étudiant';
    chargerNotificationsDepuisApi({ silent: true });
    showToast('Emprunt enregistré', `${nomEtudiant} - ${titreLivre}`);
}

// Ajoute un adhérent depuis l'espace administrateur.
async function submitStudent() {
    if (!ensureAdminAction()) return;

    const fullNameEl = document.getElementById('studentFullName');
    const codeEl = document.getElementById('studentCode');
    const emailEl = document.getElementById('studentEmail');
    const passwordEl = document.getElementById('studentPassword');
    const deptEl = document.getElementById('studentDepartment');
    const levelEl = document.getElementById('studentLevel');
    const memberTypeEl = document.getElementById('studentMemberType');

    if (!fullNameEl || !codeEl || !emailEl || !passwordEl || !deptEl || !levelEl || !memberTypeEl) return;

    const nom = fullNameEl.value.trim();
    const email = emailEl.value.trim().toLowerCase();
    const motDePasse = passwordEl.value;
    const filiere = deptEl.value.trim();
    const niveau = levelEl.value.trim();
    const typeAdherent = memberTypeEl.value === 'enseignant' ? 'enseignant' : 'etudiant';

    if (!nom || !email || !motDePasse || !filiere || !niveau) {
        showToast('Adhérent', 'Tous les champs du formulaire sont obligatoires.');
        return;
    }

    const emailValide = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!emailValide) {
        showToast('Adhérent', 'Email invalide.');
        return;
    }

    let reponse = null;
    try {
        reponse = await apiJson(`${API_BASE}/etudiants_ajouter.php`, {
            method: 'POST',
            body: JSON.stringify({
                nom_complet: nom,
                email,
                mot_de_passe: motDePasse,
                filiere,
                niveau,
                type_adherent: typeAdherent
            })
        });
    } catch (error) {
        showToast('Adhérent', error.message);
        return;
    }

    [fullNameEl, emailEl, passwordEl, deptEl, levelEl].forEach(el => {
        el.value = '';
    });
    if (codeEl) codeEl.value = 'Auto-généré';
    memberTypeEl.value = 'etudiant';

    await chargerEtudiantsDepuisApi();
    closeModal('studentAdd');
    const typeLabel = typeAdherent === 'enseignant' ? 'Enseignant' : 'Étudiant';
    ajouterNotificationLocale('Inscription validée', `${nom} est maintenant inscrit comme ${typeLabel.toLowerCase()}.`);
    ajouterNotificationLocale('Adhérent ajouté', `${typeLabel} ajouté: ${nom}.`);
    const matriculeCree = reponse?.etudiant?.matricule || 'auto-généré';
    showToast('Adhérent ajouté', `${nom} ajouté (${matriculeCree}).`);
}

// Ajoute un livre au catalogue en base de données.
async function submitBook() {
    if (!ensureAdminAction()) return;

    const isbnEl = document.getElementById('bookIsbn');
    const titleEl = document.getElementById('bookTitle');
    const authorEl = document.getElementById('bookAuthor');
    const publisherEl = document.getElementById('bookPublisher');
    const yearEl = document.getElementById('bookYear');
    const categoryEl = document.getElementById('bookCategoryId');
    const stockTotalEl = document.getElementById('bookStockTotal');
    const stockAvailableEl = document.getElementById('bookStockAvailable');
    const locationEl = document.getElementById('bookLocation');

    if (!isbnEl || !titleEl || !authorEl || !publisherEl || !yearEl || !categoryEl || !stockTotalEl || !stockAvailableEl || !locationEl) return;

    const isbn = isbnEl.value.trim();
    const titre = titleEl.value.trim();
    const auteur = authorEl.value.trim();
    const editeur = publisherEl.value.trim();
    const annee = yearEl.value.trim();
    const categorieId = categoryEl.value.trim();
    const stockTotal = Number(stockTotalEl.value);
    const stockDisponible = Number(stockAvailableEl.value);
    const emplacement = locationEl.value.trim();

    if (!isbn || !titre || !auteur) {
        showToast('Livre', 'ISBN, titre et auteur sont obligatoires.');
        return;
    }

    if (!Number.isInteger(stockTotal) || stockTotal < 1 || !Number.isInteger(stockDisponible) || stockDisponible < 0 || stockDisponible > stockTotal) {
        showToast('Livre', 'Valeurs de stock invalides.');
        return;
    }

    try {
        await apiJson(`${API_BASE}/livres_ajouter.php`, {
            method: 'POST',
            body: JSON.stringify({
                isbn,
                titre,
                auteur,
                editeur,
                annee_publication: annee || null,
                categorie_id: categorieId || null,
                nombre_total_exemplaires: stockTotal,
                nombre_exemplaires_disponibles: stockDisponible,
                code_emplacement: emplacement
            })
        });
    } catch (error) {
        showToast('Ajout livre refusé', error.message);
        return;
    }

    [isbnEl, titleEl, authorEl, publisherEl, yearEl, locationEl].forEach(el => {
        el.value = '';
    });
    categoryEl.value = '';
    stockTotalEl.value = '1';
    stockAvailableEl.value = '1';

    await chargerLivresDepuisApi();
    renderLivresFiltres();
    closeModal('bookAdd');
    ajouterNotificationLocale('Livre ajouté', `${titre} a été ajouté au catalogue.`);
    showToast('Livre ajouté', `${titre} a été ajouté au catalogue.`);
}

function bindActions() {
    const toastClose = document.getElementById('toastClose');
    if (toastClose) toastClose.addEventListener('click', hideToast);

    document.addEventListener('click', event => {
        const adminOnlyTarget = event.target.closest('[data-admin-only="true"]');
        if (!adminOnlyTarget) return;
        if (appState.role === 'admin') return;
        event.preventDefault();
        showToast('Accès refusé', 'Action réservée à l\'administrateur.');
    });

    document.addEventListener('click', event => {
        const toastTarget = event.target.closest('[data-toast-title]');
        if (!toastTarget) return;

        if (toastTarget.matches('a')) event.preventDefault();
        const title = toastTarget.getAttribute('data-toast-title') || 'Information';
        const msg = toastTarget.getAttribute('data-toast-msg') || 'Action effectuée.';
        showToast(title, msg);
    });

    document.addEventListener('click', event => {
        const categoryBtn = event.target.closest('[data-dashboard-category]');
        if (!categoryBtn) return;

        const categorie = String(categoryBtn.getAttribute('data-dashboard-category') || 'tous').trim() || 'tous';
        appliquerFiltreCategorie(categorie);
        appState.rechercheLivre = '';
        openSection('catalogue');
        renderLivresFiltres();
        showToast('Catégorie sélectionnée', `${formaterCategorie(categorie)} affichée dans le catalogue.`);
    });

    document.addEventListener('click', event => {
        const deleteBtn = event.target.closest('[data-delete-student]');
        if (!deleteBtn) return;
        if (!ensureAdminAction()) return;

        const etudiantId = Number(deleteBtn.getAttribute('data-student-id') || 0);
        const studentName = deleteBtn.getAttribute('data-delete-student') || 'Étudiant';
        supprimerEtudiant(etudiantId, studentName);
    });

    document.addEventListener('click', event => {
        const viewBtn = event.target.closest('[data-view-student-id]');
        if (!viewBtn) return;

        const etudiantId = Number(viewBtn.getAttribute('data-view-student-id') || 0);
        const etudiant = appState.etudiants.find(item => Number(item.id) === etudiantId);
        if (!etudiant) {
            showToast('Profil étudiant', 'Profil introuvable.');
            return;
        }

        showToast(
            'Profil étudiant',
            `${etudiant.nom_complet || 'Étudiant'} • ${etudiant.matricule || 'N/A'} • ${etudiant.filiere || 'N/A'} ${etudiant.niveau || ''}`.trim()
        );
    });

    document.addEventListener('click', event => {
        const returnBtn = event.target.closest('[data-return-loan]');
        if (!returnBtn) return;
        if (!ensureAdminAction()) return;
        const empruntId = Number(returnBtn.getAttribute('data-return-loan') || 0);
        retournerEmprunt(empruntId);
    });

    document.addEventListener('click', event => {
        const convertBtn = event.target.closest('[data-convert-reservation]');
        if (!convertBtn) return;
        if (!ensureAdminAction()) return;
        const reservationId = convertBtn.getAttribute('data-convert-reservation') || '';
        preRemplirEmpruntDepuisReservation(reservationId);
    });

    document.addEventListener('click', event => {
        const validateBtn = event.target.closest('[data-validate-loan-request]');
        if (!validateBtn) return;
        if (!ensureAdminAction()) return;
        const demandeId = validateBtn.getAttribute('data-validate-loan-request') || '';
        preRemplirEmpruntDepuisReservation(demandeId);
    });

    const addStudentBtn = document.getElementById('addStudentBtn');
    if (addStudentBtn) {
        addStudentBtn.addEventListener('click', () => {
            if (!ensureAdminAction()) return;
            openModal('studentAdd');
        });
    }

    const saveSettingsBtn = document.getElementById('saveSettingsBtn');
    if (saveSettingsBtn) {
        saveSettingsBtn.addEventListener('click', async () => {
            const settingsName = document.getElementById('settingsName');
            const settingsEmail = document.getElementById('settingsEmail');
            const settingsLoanDays = document.getElementById('settingsLoanDays');
            const settingsPenalty = document.getElementById('settingsPenalty');
            const settingsLoanQuota = document.getElementById('settingsLoanQuota');

            const nom = String(settingsName?.value || '').trim();
            const email = String(settingsEmail?.value || '').trim().toLowerCase();

            if (!nom || !email) {
                showToast('Paramètres', 'Nom et email sont obligatoires.');
                return;
            }

            try {
                const data = await apiJson(`${API_BASE}/profil_modifier.php`, {
                    method: 'POST',
                    body: JSON.stringify({
                        nom_complet: nom,
                        email
                    })
                });
                appState.currentUser = {
                    ...(appState.currentUser || {}),
                    name: data?.utilisateur?.nom_complet || nom,
                    email: data?.utilisateur?.email || email
                };
            } catch (error) {
                showToast('Paramètres', error.message);
                return;
            }

            if (appState.role === 'admin') {
                const duree = Number(settingsLoanDays?.value || appState.parametresApplication.dureeMaxEmpruntJours);
                const penalite = Number(settingsPenalty?.value || appState.parametresApplication.penaliteJournaliere);
                const quota = Number(settingsLoanQuota?.value || appState.parametresApplication.quotaMaxEmpruntsActifs);

                if (Number.isFinite(duree) && duree > 0) {
                    appState.parametresApplication.dureeMaxEmpruntJours = duree;
                }
                if (Number.isFinite(penalite) && penalite >= 0) {
                    appState.parametresApplication.penaliteJournaliere = penalite;
                }
                if (Number.isFinite(quota) && quota >= 1) {
                    appState.parametresApplication.quotaMaxEmpruntsActifs = quota;
                }

                try {
                    await apiJson(`${API_BASE}/parametres_modifier.php`, {
                        method: 'POST',
                        body: JSON.stringify({
                            duree_max_emprunt_jours: appState.parametresApplication.dureeMaxEmpruntJours,
                            montant_penalite_journalier: appState.parametresApplication.penaliteJournaliere,
                            quota_max_emprunts_actifs: appState.parametresApplication.quotaMaxEmpruntsActifs
                        })
                    });
                } catch (error) {
                    showToast('Paramètres', error.message);
                    return;
                }
            }

            updateUserIdentity();
            enregistrerSessionPersistante();
            appliquerParametresCompteDansFormulaire();
            renderOperationsEtudiant();
            showToast('Paramètres', 'Paramètres enregistrés avec succès.');
        });
    }

    const markAllReadBtn = document.getElementById('markAllReadBtn');
    if (markAllReadBtn) {
        markAllReadBtn.addEventListener('click', async () => {
            if (!ensureAdminAction()) return;
            const avant = appState.notifications.filter(notification => !notification.lue).length;
            if (avant === 0) return;
            try {
                await apiJson(`${API_BASE}/notifications_tout_lu.php`, { method: 'POST' });
                await chargerNotificationsDepuisApi({ silent: true });
                showToast('Notifications', 'Toutes les notifications ont été marquées comme lues.');
            } catch (error) {
                showToast('Notifications', error.message || 'Impossible de mettre à jour les notifications.');
            }
        });
    }

    document.addEventListener('click', async event => {
        const markBtn = event.target.closest('[data-mark-read]');
        if (!markBtn) return;
        if (!ensureAdminAction()) return;
        const id = String(markBtn.getAttribute('data-mark-read') || '').trim();
        if (!id) return;
        try {
            await apiJson(`${API_BASE}/notifications_marquer_lue.php`, {
                method: 'POST',
                body: JSON.stringify({ notification_id: Number(id) })
            });
            await chargerNotificationsDepuisApi({ silent: true });
            showToast('Notification', 'Notification marquée comme lue.');
        } catch (error) {
            showToast('Notification', error.message || 'Impossible de marquer la notification.');
        }
    });
}

function renderNotifications() {
    const list = document.getElementById('notificationList');
    if (!list) return;

    if (!Array.isArray(appState.notifications) || appState.notifications.length === 0) {
        list.innerHTML = '<div class="notification-item"><div><strong>Aucune notification</strong><p>Tout est à jour.</p></div><span class="status-pill retourne">Lu</span></div>';
        appState.unreadNotifications = 0;
        updateNotificationBadge();
        return;
    }

    list.innerHTML = appState.notifications.map(notification => {
        const unreadClass = notification.lue ? '' : ' unread';
        const peutMarquer = appState.role === 'admin';
        const action = notification.lue
            ? '<span class="status-pill retourne">Lu</span>'
            : (peutMarquer
                ? `<button class="btn-secondary" data-mark-read="${echapperHtml(notification.id)}">Marquer lu</button>`
                : '<span class="status-pill en-cours">Non lu</span>');
        return `<div class="notification-item${unreadClass}"><div><strong>${echapperHtml(notification.title)}</strong><p>${echapperHtml(notification.message)}</p></div>${action}</div>`;
    }).join('');

    appState.unreadNotifications = appState.notifications.filter(notification => !notification.lue).length;
    updateNotificationBadge();
}

function chargerNotificationsPersistantes() {
    try {
        const brut = localStorage.getItem(STORAGE_NOTIFICATIONS_KEY);
        if (brut) {
            const notifications = JSON.parse(brut);
            if (Array.isArray(notifications)) {
                appState.notifications = notifications.map(notification => ({
                    id: String(notification.id || genererIdOperation()),
                    title: String(notification.title || 'Notification'),
                    message: String(notification.message || ''),
                    lue: Boolean(notification.lue)
                }));
                appState.unreadNotifications = appState.notifications.filter(notification => !notification.lue).length;
                return;
            }
        }
    } catch (error) {
        // ignorer et revenir à une liste vide
    }

    appState.notifications = [];
    appState.unreadNotifications = appState.notifications.filter(notification => !notification.lue).length;
    enregistrerNotificationsPersistantes();
}

function enregistrerNotificationsPersistantes() {
    localStorage.setItem(STORAGE_NOTIFICATIONS_KEY, JSON.stringify(appState.notifications || []));
}

function sessionUtilisateurActive() {
    return Boolean(appState.currentUser && appState.currentUser.email);
}

function normaliserNotificationServeur(notification) {
    return {
        id: String(notification.id || genererIdOperation()),
        title: String(notification.titre || notification.title || 'Notification'),
        message: String(notification.message || ''),
        lue: Boolean(Number(notification.est_lue ?? notification.lue ?? 0)),
        type: String(notification.type || 'info')
    };
}

async function chargerNotificationsDepuisApi(options = {}) {
    if (!sessionUtilisateurActive()) return;
    const silent = Boolean(options.silent);
    try {
        const data = await apiJson(`${API_BASE}/notifications_lister.php`, { method: 'GET' });
        const notifications = Array.isArray(data.notifications) ? data.notifications : [];
        appState.notifications = notifications.map(normaliserNotificationServeur);
        synchroniserEtatNotifications();
    } catch (error) {
        if (!silent) {
            showToast('Notifications', error.message || 'Impossible de charger les notifications.');
        }
    }
}

function synchroniserEtatNotifications() {
    appState.unreadNotifications = appState.notifications.filter(notification => !notification.lue).length;
    enregistrerNotificationsPersistantes();
    renderNotifications();
}

function ajouterNotificationLocale(title, message) {
    const notification = {
        id: genererIdOperation(),
        title: String(title || 'Notification'),
        message: String(message || ''),
        lue: false
    };
    if (!sessionUtilisateurActive()) {
        appState.notifications = [notification, ...(appState.notifications || [])].slice(0, 50);
        synchroniserEtatNotifications();
        return;
    }

    apiJson(`${API_BASE}/notifications_creer.php`, {
        method: 'POST',
        body: JSON.stringify({
            titre: notification.title,
            message: notification.message,
            type: 'info'
        })
    })
        .then(() => chargerNotificationsDepuisApi({ silent: true }))
        .catch(() => {
            appState.notifications = [notification, ...(appState.notifications || [])].slice(0, 50);
            synchroniserEtatNotifications();
        });
}

function publierNotificationServeur(titre, message, type = 'info') {
    if (!sessionUtilisateurActive()) return;
    apiJson(`${API_BASE}/notifications_creer.php`, {
        method: 'POST',
        body: JSON.stringify({
            titre: String(titre || 'Notification'),
            message: String(message || ''),
            type: String(type || 'info')
        })
    })
        .then(() => chargerNotificationsDepuisApi({ silent: true }))
        .catch(() => {});
}

function updateNotificationBadge() {
    const navBadge = document.getElementById('notifBadgeNav');
    if (!navBadge) return;
    navBadge.textContent = String(appState.unreadNotifications);
    navBadge.style.display = appState.unreadNotifications > 0 ? 'inline-block' : 'none';
}

let toastTimer = null;
function showToast(title, msg) {
    const el = document.getElementById('toastEl');
    const titleEl = document.getElementById('toastTitle');
    const msgEl = document.getElementById('toastMsg');

    if (!el || !titleEl || !msgEl) return;

    titleEl.textContent = title;
    msgEl.textContent = msg;
    el.classList.add('show');

    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, 3500);
}

function hideToast() {
    const el = document.getElementById('toastEl');
    if (el) el.classList.remove('show');
}

function animateCounters() {
    updateDashboardKpis({ animate: true });
}

function animerValeurCompteur(el, target) {
    if (!el) return;
    const borne = Math.max(0, Number(target) || 0);
    const courant = Number(String(el.textContent || '0').replace(/[^\d]/g, '')) || 0;
    const duree = 700;
    const pas = Math.max(1, Math.ceil(Math.abs(borne - courant) / (duree / 16)));
    let valeur = courant;

    const interval = setInterval(() => {
        if (valeur < borne) {
            valeur = Math.min(borne, valeur + pas);
        } else if (valeur > borne) {
            valeur = Math.max(borne, valeur - pas);
        } else {
            clearInterval(interval);
        }
        el.textContent = valeur.toLocaleString('fr-FR');
    }, 16);
}

// Recalcule les KPI (livres, adhérents, emprunts en cours/retard).
function updateDashboardKpis(options = {}) {
    const animate = options.animate !== false;
    const livres = Array.isArray(appState.livresCatalogue) ? appState.livresCatalogue : [];
    const etudiants = Array.isArray(appState.etudiants) ? appState.etudiants : [];
    const emprunts = Array.isArray(appState.emprunts) ? appState.emprunts : [];

    const totalLivres = livres.length;
    const totalEnseignants = etudiants.filter(etudiant => {
        const roleNom = normaliserTexte(etudiant?.role_nom || '');
        if (roleNom.includes('enseign')) return true;
        const niveau = normaliserTexte(etudiant?.niveau || '');
        return niveau.includes('enseign');
    }).length;
    const totalAdherents = etudiants.length;
    const totalEtudiants = Math.max(0, totalAdherents - totalEnseignants);
    const totalEmprunts = emprunts.length;
    const totalCategories = new Set(
        livres
            .map(livre => String(livre.categorie || '').trim())
            .filter(Boolean)
    ).size;
    const totalEmpruntsEnCours = emprunts.filter(emprunt =>
        mapperStatutEmprunt(emprunt.statut, emprunt.date_retour_prevue, emprunt.date_retour_effective).code === 'en_cours'
    ).length;
    const totalEmpruntsEnRetard = emprunts.filter(emprunt =>
        mapperStatutEmprunt(emprunt.statut, emprunt.date_retour_prevue, emprunt.date_retour_effective).code === 'en_retard'
    ).length;

    const kpis = [
        ['kpiBooksTotal', totalLivres],
        ['kpiStudentsTotal', totalEtudiants],
        ['kpiTeachersTotal', totalEnseignants],
        ['kpiLoansCurrent', totalEmpruntsEnCours],
        ['kpiLoansLate', totalEmpruntsEnRetard]
    ];

    kpis.forEach(([id, valeur]) => {
        const el = document.getElementById(id);
        if (!el) return;
        if (!animate) {
            el.textContent = Number(valeur).toLocaleString('fr-FR');
            return;
        }
        animerValeurCompteur(el, valeur);
    });

    const loanBadgeNav = document.getElementById('loanBadgeNav');
    if (loanBadgeNav) {
        loanBadgeNav.textContent = String(totalEmpruntsEnCours);
        loanBadgeNav.style.display = totalEmpruntsEnCours > 0 ? 'inline-block' : 'none';
    }

    const heroBooksCount = document.getElementById('heroBooksCount');
    const heroStudentsCount = document.getElementById('heroStudentsCount');
    const heroLoansCount = document.getElementById('heroLoansCount');
    const heroCategoriesCount = document.getElementById('heroCategoriesCount');
    if (heroBooksCount) heroBooksCount.textContent = totalLivres.toLocaleString('fr-FR');
    if (heroStudentsCount) heroStudentsCount.textContent = totalAdherents.toLocaleString('fr-FR');
    if (heroLoansCount) heroLoansCount.textContent = totalEmprunts.toLocaleString('fr-FR');
    if (heroCategoriesCount) heroCategoriesCount.textContent = totalCategories.toLocaleString('fr-FR');

    if (appState.previousDashboardKpis) {
        updateTrendBadge('kpiBooksTrend', totalLivres, appState.previousDashboardKpis.totalLivres);
        updateTrendBadge('kpiStudentsTrend', totalEtudiants, appState.previousDashboardKpis.totalEtudiants);
        updateTrendBadge('kpiTeachersTrend', totalEnseignants, appState.previousDashboardKpis.totalEnseignants);
        updateTrendBadge('kpiLoansCurrentTrend', totalEmpruntsEnCours, appState.previousDashboardKpis.totalEmpruntsEnCours);
        updateTrendBadge('kpiLoansLateTrend', totalEmpruntsEnRetard, appState.previousDashboardKpis.totalEmpruntsEnRetard);
    } else {
        ['kpiBooksTrend', 'kpiStudentsTrend', 'kpiTeachersTrend', 'kpiLoansCurrentTrend', 'kpiLoansLateTrend'].forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            el.classList.remove('up', 'down');
            el.classList.add('warn');
            el.innerHTML = '<i class="fas fa-minus"></i> Stable';
        });
    }

    appState.previousDashboardKpis = {
        totalLivres,
        totalEtudiants,
        totalEnseignants,
        totalEmpruntsEnCours,
        totalEmpruntsEnRetard
    };
}

function buildChart(containerId) {
    const emprunts = Array.isArray(appState.emprunts) ? appState.emprunts : [];
    const maintenant = new Date();
    const anneeCourante = maintenant.getFullYear();
    const moisCourant = maintenant.getMonth();
    const labels = [];
    const seriePrets = [];
    const serieRetours = [];

    for (let i = 6; i >= 0; i -= 1) {
        const d = new Date(anneeCourante, moisCourant - i, 1);
        const y = d.getFullYear();
        const m = d.getMonth();
        labels.push(d.toLocaleDateString('fr-FR', { month: 'short' }));
        seriePrets.push(
            emprunts.filter(emprunt => {
                const dateEmprunt = parseDateIso(emprunt.date_emprunt);
                return Boolean(dateEmprunt) && dateEmprunt.getFullYear() === y && dateEmprunt.getMonth() === m;
            }).length
        );
        serieRetours.push(
            emprunts.filter(emprunt => {
                const dateRetour = parseDateIso(emprunt.date_retour_effective);
                return Boolean(dateRetour) && dateRetour.getFullYear() === y && dateRetour.getMonth() === m;
            }).length
        );
    }

    buildChartSeries(containerId, labels, seriePrets, serieRetours);
}

function parseDateIso(brut) {
    const valeur = String(brut || '').trim();
    if (!valeur) return null;
    const date = new Date(`${valeur}T00:00:00`);
    return Number.isNaN(date.getTime()) ? null : date;
}

function updateTrendBadge(id, currentValue, previousValue) {
    const el = document.getElementById(id);
    if (!el) return;

    const current = Number(currentValue) || 0;
    const previous = Number(previousValue) || 0;
    const delta = current - previous;

    el.classList.remove('up', 'down', 'warn');

    if (delta === 0) {
        el.classList.add('warn');
        el.innerHTML = '<i class="fas fa-minus"></i> Stable';
        return;
    }

    const pourcentage = previous > 0
        ? Math.round((Math.abs(delta) / previous) * 100)
        : 100;

    if (delta > 0) {
        el.classList.add('up');
        el.innerHTML = `<i class="fas fa-arrow-up"></i> +${pourcentage}%`;
    } else {
        el.classList.add('down');
        el.innerHTML = `<i class="fas fa-arrow-down"></i> -${pourcentage}%`;
    }
}

function updateStatistiquesSection() {
    const emprunts = Array.isArray(appState.emprunts) ? appState.emprunts : [];
    const maintenant = new Date();
    const anneeCourante = maintenant.getFullYear();
    const moisCourant = maintenant.getMonth();
    const dateMoisPrecedent = new Date(anneeCourante, moisCourant - 1, 1);
    const anneeMoisPrecedent = dateMoisPrecedent.getFullYear();
    const moisPrecedent = dateMoisPrecedent.getMonth();

    const pretsCeMois = emprunts.filter(emprunt => {
        const d = parseDateIso(emprunt.date_emprunt);
        if (!d) return false;
        return d.getFullYear() === anneeCourante && d.getMonth() === moisCourant;
    }).length;

    const pretsMoisPrecedent = emprunts.filter(emprunt => {
        const d = parseDateIso(emprunt.date_emprunt);
        if (!d) return false;
        return d.getFullYear() === anneeMoisPrecedent && d.getMonth() === moisPrecedent;
    }).length;

    const retards = emprunts.filter(emprunt =>
        mapperStatutEmprunt(emprunt.statut, emprunt.date_retour_prevue, emprunt.date_retour_effective).code === 'en_retard'
    ).length;

    const retardsMoisPrecedent = emprunts.filter(emprunt => {
        const datePrevue = parseDateIso(emprunt.date_retour_prevue);
        if (!datePrevue) return false;
        if (datePrevue.getFullYear() !== anneeMoisPrecedent || datePrevue.getMonth() !== moisPrecedent) return false;

        const dateRetour = parseDateIso(emprunt.date_retour_effective);
        if (!dateRetour) return true;
        return dateRetour.getTime() > datePrevue.getTime();
    }).length;

    const retoursCeMois = emprunts.filter(emprunt => {
        const d = parseDateIso(emprunt.date_retour_effective);
        if (!d) return false;
        return d.getFullYear() === anneeCourante && d.getMonth() === moisCourant;
    }).length;

    const retoursMoisPrecedent = emprunts.filter(emprunt => {
        const d = parseDateIso(emprunt.date_retour_effective);
        if (!d) return false;
        return d.getFullYear() === anneeMoisPrecedent && d.getMonth() === moisPrecedent;
    }).length;

    const etudiantsActifs = new Set(
        emprunts
            .filter(emprunt => {
                if (!emprunt?.etudiant_id) return false;
                if (emprunt.date_retour_effective) return false;
                const statut = mapperStatutEmprunt(emprunt.statut, emprunt.date_retour_prevue, emprunt.date_retour_effective).code;
                return statut === 'en_cours' || statut === 'en_retard';
            })
            .map(emprunt => String(emprunt.etudiant_id))
    ).size;

    const etudiantsActifsMoisPrecedent = new Set(
        emprunts
            .filter(emprunt => {
                if (!emprunt?.etudiant_id) return false;
                const dateEmprunt = parseDateIso(emprunt.date_emprunt);
                if (!dateEmprunt) return false;
                return dateEmprunt.getFullYear() === anneeMoisPrecedent && dateEmprunt.getMonth() === moisPrecedent;
            })
            .map(emprunt => String(emprunt.etudiant_id))
    ).size;

    const statsMap = [
        ['statsLoansMonth', pretsCeMois],
        ['statsLateLoans', retards],
        ['statsReturnsMonth', retoursCeMois],
        ['statsActiveStudents', etudiantsActifs]
    ];
    statsMap.forEach(([id, valeur]) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.textContent = Number(valeur).toLocaleString('fr-FR');
    });

    updateTrendBadge('statsLoansTrend', pretsCeMois, pretsMoisPrecedent);
    updateTrendBadge('statsLateTrend', retards, retardsMoisPrecedent);
    updateTrendBadge('statsReturnsTrend', retoursCeMois, retoursMoisPrecedent);
    updateTrendBadge('statsActiveTrend', etudiantsActifs, etudiantsActifsMoisPrecedent);

    const labels = [];
    const seriePrets = [];
    const serieRetours = [];
    for (let i = 6; i >= 0; i -= 1) {
        const d = new Date(anneeCourante, moisCourant - i, 1);
        const y = d.getFullYear();
        const m = d.getMonth();
        labels.push(d.toLocaleDateString('fr-FR', { month: 'short' }));
        seriePrets.push(
            emprunts.filter(emprunt => {
                const brut = String(emprunt.date_emprunt || '');
                if (!brut) return false;
                const t = new Date(`${brut}T00:00:00`);
                return !Number.isNaN(t.getTime()) && t.getFullYear() === y && t.getMonth() === m;
            }).length
        );
        serieRetours.push(
            emprunts.filter(emprunt => {
                const brut = String(emprunt.date_retour_effective || '');
                if (!brut) return false;
                const t = new Date(`${brut}T00:00:00`);
                return !Number.isNaN(t.getTime()) && t.getFullYear() === y && t.getMonth() === m;
            }).length
        );
    }

    buildChartSeries('chartBarsStats', labels, seriePrets, serieRetours);
    buildChart('chartBars');
}

function buildChartSeries(containerId, labels, serieA, serieB) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const maxVal = Math.max(1, ...(serieA || []), ...(serieB || []));
    container.innerHTML = '';

    labels.forEach((label, index) => {
        const hA = Math.round(((serieA[index] || 0) / maxVal) * 76);
        const hB = Math.round(((serieB[index] || 0) / maxVal) * 76);
        const col = document.createElement('div');
        col.className = 'chart-bar-col';
        col.innerHTML = `
            <div style="display:flex;align-items:flex-end;gap:3px;height:76px;">
                <div class="chart-bar primary" style="height:${hA}px;flex:1;" title="Emprunts : ${serieA[index] || 0}"></div>
                <div class="chart-bar accent" style="height:${hB}px;flex:1;" title="Retours : ${serieB[index] || 0}"></div>
            </div>
            <span class="chart-bar-lbl">${echapperHtml(label)}</span>
        `;
        container.appendChild(col);
    });
}

function setDefaultDates() {
    const today = new Date();
    const plus30 = new Date(today);
    plus30.setDate(plus30.getDate() + 30);

    const fmt = date => {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    };

    const startEl = document.getElementById('loanDateStart');
    const endEl = document.getElementById('loanDateEnd');
    if (startEl) startEl.value = fmt(today);
    if (endEl) endEl.value = fmt(plus30);
}

function initialiserCatalogueLivres() {
    appState.livresCatalogue = [];

    renderSelectLivresPourEmprunt();
    updateDashboardKpis({ animate: false });
}

function normaliserTexte(texte) {
    return String(texte || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
}

function livresFiltres() {
    const recherche = normaliserTexte(appState.rechercheLivre);

    return appState.livresCatalogue.filter(livre => {
        const categorieOk = appState.filtreCategorie === 'tous' || livre.categorie === appState.filtreCategorie;
        if (!categorieOk) return false;
        if (!recherche) return true;

        const haystack = normaliserTexte(`${livre.titre} ${livre.auteur} ${livre.isbn} ${livre.categorie} ${livre.description}`);
        return haystack.includes(recherche);
    });
}

function renderLivresFiltres() {
    const livres = livresFiltres();
    renderListeLivresDashboard(livres.slice(0, 10));
    renderTableCatalogue(livres);
    renderCategoriesDashboard();
}

function renderCategoriesDashboard() {
    const container = document.getElementById('dashboardCategoriesGrid');
    if (!container) return;

    const livres = Array.isArray(appState.livresCatalogue) ? appState.livresCatalogue : [];
    if (!livres.length) {
        container.innerHTML = '<button type="button" class="cat-card c1 cat-card-btn"><div class="cat-icon-wrap"><i class="fas fa-book"></i></div><div class="cat-name">Aucune catégorie</div><div class="cat-count">0 livre</div></button>';
        return;
    }

    const compteParCategorie = livres.reduce((acc, livre) => {
        const categorie = String(livre.categorie || 'autres').trim() || 'autres';
        acc[categorie] = (acc[categorie] || 0) + 1;
        return acc;
    }, {});

    const visuels = {
        informatique: { cls: 'c1', icon: 'fa-laptop-code' },
        mathematiques: { cls: 'c2', icon: 'fa-calculator' },
        physique: { cls: 'c3', icon: 'fa-atom' },
        sciences: { cls: 'c4', icon: 'fa-flask' },
        litterature: { cls: 'c5', icon: 'fa-feather-alt' },
        histoire: { cls: 'c6', icon: 'fa-globe' }
    };

    const categories = Object.entries(compteParCategorie).sort((a, b) => b[1] - a[1]);
    container.innerHTML = categories.map(([categorie, total], index) => {
        const visuel = visuels[categorie] || { cls: `c${(index % 6) + 1}`, icon: 'fa-book' };
        const label = formaterCategorie(categorie);
        const livreLabel = total > 1 ? 'livres' : 'livre';
        return `<button type="button" class="cat-card ${visuel.cls} cat-card-btn" data-dashboard-category="${echapperHtml(categorie)}"><div class="cat-icon-wrap"><i class="fas ${visuel.icon}"></i></div><div class="cat-name">${echapperHtml(label)}</div><div class="cat-count">${total.toLocaleString('fr-FR')} ${livreLabel}</div></button>`;
    }).join('');
}

function afficherCatalogueLivresDisponiblesBase() {
    const livresDisponiblesBase = (Array.isArray(appState.livresCatalogueBdd) ? appState.livresCatalogueBdd : [])
        .filter(livre => Number(livre.stock) > 0);
    const livresAAfficher = livresDisponiblesBase;

    appState.rechercheLivre = '';
    appState.filtreCategorie = 'tous';

    const quickSearch = document.getElementById('quickSearch');
    const advSearch = document.getElementById('advSearch');
    if (quickSearch) quickSearch.value = '';
    if (advSearch) advSearch.value = '';

    appliquerFiltreCategorie('tous');
    openSection('catalogue');
    renderListeLivresDashboard(livresAAfficher.slice(0, 10));
    renderTableCatalogue(livresAAfficher);
    showToast(
        'Catalogue',
        livresDisponiblesBase.length
            ? `Livres disponibles en base: ${livresDisponiblesBase.length}`
            : 'Aucun livre disponible en base.'
    );
}

function renderListeLivresDashboard(livres) {
    const container = document.getElementById('bookListDashboard');
    if (!container) return;

    if (!livres.length) {
        container.innerHTML = '<div class="student-ops-empty" style="padding:8px 6px;">Aucun livre trouvé pour ce filtre.</div>';
        return;
    }

    container.innerHTML = livres.map(livre => `
        <button type="button" class="book-item book-item-btn" data-open-modal="bookDetail" data-book-id="${livre.id}">
            <div class="book-thumb"><img src="${echapperHtml(livre.image)}" alt="${echapperHtml(livre.titre)}"></div>
            <div class="book-details">
                <div class="book-name">${echapperHtml(livre.titre)}</div>
                <div class="book-author">${echapperHtml(livre.auteur)}</div>
                <span class="book-cat">${formaterCategorie(livre.categorie)}</span>
            </div>
            <div class="book-stock-badge ${livre.stock > 0 ? 'ok' : 'empty'}">
                <i class="fas ${livre.stock > 0 ? 'fa-check-circle' : 'fa-times-circle'}"></i> ${livre.stock}
            </div>
        </button>
    `).join('');
}

function renderTableCatalogue(livres) {
    const body = document.getElementById('catalogueTableBody');
    if (!body) return;

    if (!livres.length) {
        body.innerHTML = '<tr><td colspan="5" class="student-ops-empty">Aucun résultat trouvé.</td></tr>';
        return;
    }

    body.innerHTML = livres.map(livre => `
        <tr>
            <td>${echapperHtml(livre.titre)}</td>
            <td>${echapperHtml(livre.auteur)}</td>
            <td>${formaterCategorie(livre.categorie)}</td>
            <td>
                ${livre.stock > 0
                    ? '<span class="status-pill retourne">' + livre.stock + ' disponibles</span>'
                    : '<span class="status-pill en-retard">Rupture</span>'}
            </td>
            <td>
                ${livre.stock > 0
                    ? '<button class="action-btn btn-return" data-open-modal="bookDetail" data-book-id="' + livre.id + '"><i class="fas fa-eye"></i> Détails</button>'
                    : '<button class="action-btn btn-done" disabled><i class="fas fa-ban"></i> Indisponible</button>'}
            </td>
        </tr>
    `).join('');
}

function renderSelectLivresPourEmprunt() {
    const select = document.getElementById('loanBookSelect');
    if (!select) return;

    const livresCatalogue = Array.isArray(appState.livresCatalogue) ? appState.livresCatalogue : [];
    const livresBdd = Array.isArray(appState.livresCatalogueBdd) ? appState.livresCatalogueBdd : [];
    const livreBddParTitre = new Map(
        livresBdd.map(livre => [normaliserTexte(livre.titre), livre])
    );

    const options = livresCatalogue
        .filter(livre => livre.stock > 0)
        .map(livre => {
            const cleTitre = normaliserTexte(livre.titre);
            const livreBdd = livreBddParTitre.get(cleTitre) || null;
            const valeur = livreBdd ? `db:${livreBdd.id}` : `cat:${livre.id}`;
            const suffixe = livreBdd ? '' : ' (catalogue local)';
            const stockRestant = Number(livreBdd?.stock ?? livre.stock ?? 0);
            const libelle = `${livre.titre}${suffixe} — reste: ${stockRestant}`;
            return `<option value="${echapperHtml(valeur)}">${echapperHtml(libelle)}</option>`;
        })
        .join('');

    if (!options) {
        select.innerHTML = '<option value="">— Aucun livre disponible dans le catalogue —</option>';
        select.value = '';
        return;
    }

    select.innerHTML = '<option value="">— Sélectionner un livre —</option>' + options;
}

function remplirModalLivre(livre) {
    const img = document.getElementById('bookDetailCoverImg');
    const title = document.getElementById('bookDetailTitle');
    const author = document.getElementById('bookDetailAuthor');
    const isbn = document.getElementById('bookDetailIsbn');
    const publisher = document.getElementById('bookDetailPublisher');
    const year = document.getElementById('bookDetailYear');
    const category = document.getElementById('bookDetailCategory');
    const description = document.getElementById('bookDetailDescription');
    const stock = document.getElementById('bookDetailStock');
    const location = document.getElementById('bookDetailLocation');

    if (img) {
        img.src = livre.image;
        img.alt = `Couverture ${livre.titre}`;
    }
    if (title) title.textContent = livre.titre;
    if (author) author.textContent = livre.auteur;
    if (isbn) isbn.textContent = livre.isbn;
    if (publisher) publisher.textContent = livre.editeur;
    if (year) year.textContent = String(livre.annee);
    if (category) category.textContent = formaterCategorie(livre.categorie);
    if (description) description.textContent = livre.description;
    if (stock) {
        stock.textContent = `${livre.stock} exemplaire${livre.stock > 1 ? 's' : ''}`;
        stock.style.background = livre.stock > 0 ? 'var(--success)' : 'var(--danger)';
    }
    if (location) location.textContent = livre.emplacement;
}

function formaterCategorie(categorie) {
    const map = {
        informatique: 'Informatique',
        mathematiques: 'Mathématiques',
        sciences: 'Sciences',
        litterature: 'Littérature',
        histoire: 'Histoire',
        physique: 'Physique'
    };
    return map[categorie] || categorie;
}

function categorieApiVersCle(categorieNom) {
    const c = normaliserTexte(categorieNom);
    if (c.includes('informatique')) return 'informatique';
    if (c.includes('mathem')) return 'mathematiques';
    if (c.includes('physique')) return 'physique';
    if (c.includes('histoire')) return 'histoire';
    if (c.includes('litter')) return 'litterature';
    if (c.includes('science') || c.includes('chimie') || c.includes('biologie')) return 'sciences';
    return 'sciences';
}

// Charge les livres depuis l'API et met à jour les vues liées.
async function chargerLivresDepuisApi() {
    try {
        const data = await apiJson(`${API_BASE}/livres_lister.php`, { method: 'GET' });
        const livresApi = Array.isArray(data.livres) ? data.livres : [];
        if (!livresApi.length) {
            appState.livresCatalogueBdd = [];
            renderSelectLivresPourEmprunt();
            renderLivresFiltres();
            updateDashboardKpis({ animate: false });
            return;
        }

        const livresNormalises = livresApi.map((livre, index) => ({
            id: Number(livre.id),
            isbn: livre.isbn || '',
            titre: livre.titre || 'Sans titre',
            auteur: livre.auteur || 'Auteur inconnu',
            categorie: categorieApiVersCle(livre.categorie_nom || ''),
            editeur: livre.editeur || 'Éditeur non précisé',
            annee: Number(livre.annee_publication || 0) || 'N/A',
            stock: Number(livre.nombre_exemplaires_disponibles || 0),
            emplacement: livre.code_emplacement || 'N/A',
            description: `Document de catégorie ${livre.categorie_nom || 'générale'}.`,
            image: `https://picsum.photos/seed/book-db-${livre.id || index + 1}/220/320`
        }));
        appState.livresCatalogue = livresNormalises;
        appState.livresCatalogueBdd = [...livresNormalises];

        renderSelectLivresPourEmprunt();
        renderLivresFiltres();
        renderReservationsAdmin();
        updateDashboardKpis({ animate: false });
    } catch (error) {
        // fallback local déjà chargé
        appState.livresCatalogueBdd = [];
        updateDashboardKpis({ animate: false });
        renderSelectLivresPourEmprunt();
        renderLivresFiltres();
        renderReservationsAdmin();
    }
}

// Charge les adhérents/étudiants depuis l'API.
async function chargerEtudiantsDepuisApi() {
    try {
        const data = await apiJson(`${API_BASE}/etudiants_lister.php`, { method: 'GET' });
        const etudiants = Array.isArray(data.etudiants) ? data.etudiants : [];
        appState.etudiants = etudiants;
        renderEtudiantsTable();
        renderNouveauxEtudiantsDashboard();
        renderSelectEtudiantsPourEmprunt(appState.etudiants);
        updateStatistiquesSection();
        updateDashboardKpis({ animate: false });
    } catch (error) {
        appState.etudiants = [];
        renderEtudiantsTable();
        renderNouveauxEtudiantsDashboard();
        renderSelectEtudiantsPourEmprunt(appState.etudiants);
        updateStatistiquesSection();
        updateDashboardKpis({ animate: false });
        showToast('Étudiants', 'API indisponible.');
    }
}

// Charge les emprunts et synchronise les tableaux de suivi.
async function chargerEmpruntsDepuisApi() {
    try {
        const data = await apiJson(`${API_BASE}/emprunts_lister.php`, { method: 'GET' });
        const emprunts = Array.isArray(data.emprunts) ? data.emprunts : [];
        appState.emprunts = emprunts;
        renderTableauxEmprunts();
        synchroniserOperationsEtudiantDepuisEmprunts(appState.emprunts);
        updateStatistiquesSection();
        updateDashboardKpis({ animate: false });
    } catch (error) {
        appState.emprunts = [];
        renderTableauxEmprunts();
        synchroniserOperationsEtudiantDepuisEmprunts(appState.emprunts);
        updateStatistiquesSection();
        updateDashboardKpis({ animate: false });
        showToast('Emprunts', 'API indisponible.');
    }
}

// Charge les paramètres métier (durée, pénalité, quota).
async function chargerParametresApplication() {
    try {
        const data = await apiJson(`${API_BASE}/parametres_lire.php`, { method: 'GET' });
        const parametres = data.parametres || {};

        const duree = Number(parametres.duree_max_emprunt_jours);
        const penalite = Number(parametres.montant_penalite_journalier);
        const quota = Number(parametres.quota_max_emprunts_actifs);

        if (Number.isFinite(duree) && duree > 0) {
            appState.parametresApplication.dureeMaxEmpruntJours = duree;
        }
        if (Number.isFinite(penalite) && penalite >= 0) {
            appState.parametresApplication.penaliteJournaliere = penalite;
        }
        if (Number.isFinite(quota) && quota >= 1) {
            appState.parametresApplication.quotaMaxEmpruntsActifs = quota;
        }
    } catch (error) {
        // conserver les valeurs par défaut
    }

    appliquerParametresCompteDansFormulaire();
}

function renderTableauxEmprunts() {
    const tousLesEmprunts = Array.isArray(appState.emprunts) ? appState.emprunts : [];
    const empruntsFiltres = filtrerEmpruntsSelonRecherche(tousLesEmprunts);
    renderDashboardEmprunts(tousLesEmprunts);
    renderGestionEmprunts(empruntsFiltres);
}

function filtrerEmpruntsSelonRecherche(emprunts) {
    const recherche = normaliserTexte(appState.rechercheGlobale);
    if (!recherche) return emprunts;
    return emprunts.filter(emprunt => {
        const haystack = normaliserTexte(`
            ${emprunt.nom_etudiant || ''}
            ${emprunt.titre_livre || ''}
            ${emprunt.matricule || ''}
            ${emprunt.statut || ''}
            ${emprunt.date_emprunt || ''}
            ${emprunt.date_retour_prevue || ''}
        `);
        return haystack.includes(recherche);
    });
}

function renderDashboardEmprunts(emprunts) {
    const body = document.getElementById('dashboardLoansBody');
    if (!body) return;

    const lignes = emprunts.slice(0, 6);
    if (!lignes.length) {
        body.innerHTML = '<tr><td colspan="5" class="student-ops-empty">Aucun emprunt récent.</td></tr>';
        return;
    }

    body.innerHTML = lignes.map(emprunt => {
        const statut = mapperStatutEmprunt(emprunt.statut, emprunt.date_retour_prevue, emprunt.date_retour_effective);
        const boutonAction = statut.code === 'retourne'
            ? '<span class="status-pill retourne">Clôturé</span>'
            : (appState.role === 'admin'
                ? `<button class="action-btn btn-return" data-return-loan="${Number(emprunt.id)}"><i class="fas fa-undo"></i> Retourner</button>`
                : '<span class="status-pill en-cours">En attente</span>');

        return `
            <tr>
                <td>${echapperHtml(emprunt.nom_etudiant || 'Étudiant')}</td>
                <td>${echapperHtml(emprunt.titre_livre || 'Livre')}</td>
                <td>${formaterDateAffichage(emprunt.date_retour_prevue)}</td>
                <td><span class="status-pill ${statut.classe}">${statut.libelle}</span></td>
                <td>${boutonAction}</td>
            </tr>
        `;
    }).join('');
}

function renderGestionEmprunts(emprunts) {
    const body = document.getElementById('loansManagementBody');
    if (!body) return;

    const recherche = normaliserTexte(appState.rechercheGlobale);
    const demandesEmprunt = appState.role === 'admin'
        ? (Array.isArray(appState.reservations) ? appState.reservations : [])
            .filter(item => String(item?.statut || '') === 'demande_emprunt')
            .filter(item => {
                if (!recherche) return true;
                const haystack = normaliserTexte(`
                    ${item.etudiantNom || ''}
                    ${item.etudiantEmail || ''}
                    ${item.titreLivre || ''}
                    ${item.dateReservation || ''}
                    en_attente_validation
                `);
                return haystack.includes(recherche);
            })
        : [];

    if (!emprunts.length && !demandesEmprunt.length) {
        const compteAdminNonVerifie = appState.role === 'student'
            && appState.currentUser?.roleNom === 'administrateur';
        body.innerHTML = compteAdminNonVerifie
            ? '<tr><td colspan="6" class="student-ops-empty">Aucun emprunt affiché en mode étudiant. Clique sur "Accès administrateur" pour afficher tous les emprunts.</td></tr>'
            : '<tr><td colspan="6" class="student-ops-empty">Aucun emprunt trouvé.</td></tr>';
        return;
    }

    const lignesDemandes = demandesEmprunt.map(demande => `
        <tr>
            <td>${echapperHtml(demande.etudiantNom || 'Étudiant')}</td>
            <td>${echapperHtml(demande.titreLivre || 'Livre')}</td>
            <td>${formaterDateAffichage(demande.dateReservation)}</td>
            <td>—</td>
            <td><span class="status-pill en-cours">À valider</span></td>
            <td>
                <button type="button" class="action-btn btn-return" data-validate-loan-request="${echapperHtml(demande.id)}">
                    <i class="fas fa-check"></i> Valider
                </button>
            </td>
        </tr>
    `).join('');

    const lignesEmprunts = emprunts.map(emprunt => {
        const statut = mapperStatutEmprunt(emprunt.statut, emprunt.date_retour_prevue, emprunt.date_retour_effective);
        const action = statut.code === 'retourne'
            ? '<span class="status-pill retourne">Terminé</span>'
            : (appState.role === 'admin'
                ? `<button class="action-btn btn-return" data-return-loan="${Number(emprunt.id)}"><i class="fas fa-check"></i> Retour</button>`
                : '<span class="status-pill en-cours">Suivi</span>');

        return `
            <tr>
                <td>${echapperHtml(emprunt.nom_etudiant || 'Étudiant')}</td>
                <td>${echapperHtml(emprunt.titre_livre || 'Livre')}</td>
                <td>${formaterDateAffichage(emprunt.date_emprunt)}</td>
                <td>${formaterDateAffichage(emprunt.date_retour_prevue)}</td>
                <td><span class="status-pill ${statut.classe}">${statut.libelle}</span></td>
                <td>${action}</td>
            </tr>
        `;
    }).join('');

    body.innerHTML = lignesDemandes + lignesEmprunts;
}

function mapperStatutEmprunt(statutBrut, dateRetourPrevue, dateRetourEffective) {
    const statut = String(statutBrut || '').toLowerCase();
    if (statut === 'retourne' || dateRetourEffective) {
        return { code: 'retourne', libelle: 'Retourné', classe: 'retourne' };
    }

    if (dateRetourPrevue) {
        const prevue = new Date(`${dateRetourPrevue}T00:00:00`);
        const now = new Date();
        const prevueMinuit = new Date(`${formaterIso(now)}T00:00:00`);
        if (!Number.isNaN(prevue.getTime()) && prevue < prevueMinuit) {
            return { code: 'en_retard', libelle: 'En retard', classe: 'en-retard' };
        }
    }

    return { code: 'en_cours', libelle: 'En cours', classe: 'en-cours' };
}

function synchroniserOperationsEtudiantDepuisEmprunts(emprunts) {
    if (appState.role === 'admin') return;

    appState.operationsEtudiant = emprunts.map(emprunt => ({
        id: String(emprunt.id),
        livre: emprunt.titre_livre || 'Livre',
        statut: emprunt.date_retour_effective ? 'retourne' : 'emprunte',
        jourReservation: emprunt.date_emprunt || null,
        jourRecuperation: emprunt.date_emprunt || null,
        dateEmprunt: emprunt.date_emprunt || null,
        dateRetourPrevue: emprunt.date_retour_prevue || null,
        dateRetourEffective: emprunt.date_retour_effective || null,
        montantPenalite: Number(emprunt.montant_penalite || 0)
    }));
    renderOperationsEtudiant();
}

async function supprimerEtudiant(etudiantId, nomEtudiant) {
    if (!Number.isInteger(etudiantId) || etudiantId <= 0) {
        showToast('Suppression refusée', 'Identifiant étudiant invalide.');
        return;
    }

    try {
        await apiJson(`${API_BASE}/etudiants_supprimer.php`, {
            method: 'POST',
            body: JSON.stringify({ etudiant_id: etudiantId })
        });
    } catch (error) {
        showToast('Suppression refusée', error.message);
        return;
    }

    await chargerEtudiantsDepuisApi();
    showToast('Étudiant supprimé', `${nomEtudiant} a été supprimé.`);
}

async function retournerEmprunt(empruntId) {
    if (!Number.isInteger(empruntId) || empruntId <= 0) {
        showToast('Retour refusé', 'Identifiant emprunt invalide.');
        return;
    }

    try {
        await apiJson(`${API_BASE}/emprunts_retourner.php`, {
            method: 'POST',
            body: JSON.stringify({ emprunt_id: empruntId })
        });
    } catch (error) {
        showToast('Retour refusé', error.message);
        return;
    }

    await chargerLivresDepuisApi();
    await chargerEmpruntsDepuisApi();
    await chargerEtudiantsDepuisApi();
    ajouterNotificationLocale('Retour validé', 'Un livre a été retourné avec succès.');
    showToast('Retour validé', 'Le livre a été retourné avec succès.');
}

function renderEtudiantsTable() {
    const body = document.getElementById('studentsTableBody');
    if (!body) return;
    const etudiants = filtrerEtudiantsSelonRecherche(appState.etudiants);
    if (!etudiants.length) {
        const compteAdminNonVerifie = appState.role === 'student'
            && appState.currentUser?.roleNom === 'administrateur';
        body.innerHTML = compteAdminNonVerifie
            ? '<tr><td colspan="5" class="student-ops-empty">Aucun étudiant affiché en mode étudiant. Clique sur "Accès administrateur" pour afficher tous les étudiants.</td></tr>'
            : '<tr><td colspan="5" class="student-ops-empty">Aucun étudiant trouvé.</td></tr>';
        return;
    }

    body.innerHTML = etudiants.map(etudiant => {
        const nom = etudiant.nom_complet || 'Étudiant';
        const matricule = etudiant.matricule || 'N/A';
        const filiere = etudiant.filiere || '';
        const niveau = etudiant.niveau || '';
        const actifs = Number(etudiant.nb_emprunts_actifs || 0);

        return `
            <tr>
                <td>${echapperHtml(nom)}</td>
                <td>${echapperHtml(matricule)}</td>
                <td>${echapperHtml(`${filiere} ${niveau}`.trim())}</td>
                <td>${actifs}</td>
                <td>
                    <button type="button" class="action-btn btn-return" data-view-student-id="${Number(etudiant.id)}"><i class="fas fa-eye"></i> Voir</button>
                    <button type="button" class="action-btn btn-danger" data-admin-only="true" data-student-id="${Number(etudiant.id)}" data-delete-student="${echapperHtml(nom)}"><i class="fas fa-trash"></i> Supprimer</button>
                </td>
            </tr>
        `;
    }).join('');
    appliquerEtatElementsAdmin();
}

function renderNouveauxEtudiantsDashboard() {
    const container = document.getElementById('dashboardRecentStudents');
    if (!container) return;

    const etudiants = Array.isArray(appState.etudiants) ? appState.etudiants : [];
    if (!etudiants.length) {
        container.innerHTML = '<div class="student-list-item"><div class="s-av sa1">--</div><div class="s-info"><div class="s-name">Aucun étudiant</div><div class="s-dept"><i class="fas fa-graduation-cap"></i> Aucune inscription récente</div></div><div class="s-loans-count"><i class="fas fa-book"></i> 0</div></div>';
        return;
    }

    const recents = [...etudiants]
        .sort((a, b) => {
            const dateA = new Date(`${String(a.date_inscription || '')}T00:00:00`).getTime() || 0;
            const dateB = new Date(`${String(b.date_inscription || '')}T00:00:00`).getTime() || 0;
            if (dateB !== dateA) return dateB - dateA;
            return Number(b.id || 0) - Number(a.id || 0);
        })
        .slice(0, 4);

    const avatarClasses = ['sa1', 'sa2', 'sa3', 'sa4'];
    container.innerHTML = recents.map((etudiant, index) => {
        const nom = String(etudiant.nom_complet || 'Étudiant');
        const filiere = String(etudiant.filiere || '');
        const niveau = String(etudiant.niveau || '');
        const nbEmprunts = Number(etudiant.nb_emprunts_actifs || 0);
        const initials = getInitials(nom);
        const avatarClass = avatarClasses[index % avatarClasses.length];
        return `<div class="student-list-item"><div class="s-av ${avatarClass}">${echapperHtml(initials)}</div><div class="s-info"><div class="s-name">${echapperHtml(nom)}</div><div class="s-dept"><i class="fas fa-graduation-cap"></i> ${echapperHtml(`${filiere} ${niveau}`.trim())}</div></div><div class="s-loans-count"><i class="fas fa-book"></i> ${nbEmprunts}</div></div>`;
    }).join('');
}

function filtrerEtudiantsSelonRecherche(etudiants) {
    const recherche = normaliserTexte(appState.rechercheGlobale);
    if (!recherche) return etudiants;
    return etudiants.filter(etudiant => {
        const haystack = normaliserTexte(`
            ${etudiant.nom_complet || ''}
            ${etudiant.matricule || ''}
            ${etudiant.filiere || ''}
            ${etudiant.niveau || ''}
            ${etudiant.email || ''}
        `);
        return haystack.includes(recherche);
    });
}

function renderSelectEtudiantsPourEmprunt(etudiants) {
    const select = document.getElementById('loanStudentSelect');
    if (!select) return;
    if (!etudiants.length) return;

    const options = etudiants.map(etudiant =>
        `<option value="${Number(etudiant.id)}">${echapperHtml(etudiant.nom_complet || 'Étudiant')} — ${echapperHtml(etudiant.matricule || 'N/A')}</option>`
    ).join('');

    select.innerHTML = '<option value="">— Sélectionner un étudiant —</option>' + options;
}

async function verifierSessionServeur() {
    try {
        return await apiJson(`${API_BASE}/session_utilisateur.php`, { method: 'GET' });
    } catch (error) {
        return null;
    }
}

// Helper HTTP centralisé pour les appels API JSON + gestion d'erreurs.
async function apiJson(url, options = {}) {
    const methode = options.method || 'GET';
    const headers = { ...(options.headers || {}) };
    if (methode !== 'GET' && !headers['Content-Type']) {
        headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(url, {
        method: methode,
        headers,
        body: options.body,
        credentials: 'same-origin'
    });

    const brute = await response.text();
    let data = null;
    try {
        data = brute ? JSON.parse(brute) : null;
    } catch (error) {
        const extrait = String(brute || '').trim().slice(0, 180);
        throw new Error(extrait ? `Réponse serveur invalide: ${extrait}` : 'Réponse serveur invalide.');
    }

    if (response.status === 401) {
        forceReauthentication();
    }

    if (!response.ok || data.ok === false) {
        throw new Error(data?.message || `Erreur HTTP ${response.status}`);
    }

    return data;
}

function initialiserOperationsEtudiant() {
    if (!appState.currentUser || appState.operationsEtudiant.length > 0) return;
    appState.operationsEtudiant = [];
}

function ajouterOperationReservation(livre) {
    const maintenant = new Date();
    const recuperation = new Date(maintenant);
    recuperation.setDate(maintenant.getDate() + 2);

    appState.operationsEtudiant.unshift({
        id: genererIdOperation(),
        livre,
        statut: 'reserve',
        jourReservation: formaterIso(maintenant),
        jourRecuperation: formaterIso(recuperation),
        dateEmprunt: null,
        dateRetourPrevue: null,
        dateRetourEffective: null
    });

    renderOperationsEtudiant();
}

function ajouterReservationPourAdmin(titreLivre) {
    const reservation = {
        id: genererIdOperation(),
        etudiantNom: appState.currentUser?.name || 'Étudiant',
        etudiantEmail: appState.currentUser?.email || '',
        titreLivre: titreLivre || 'Livre',
        dateReservation: formaterIso(new Date()),
        statut: 'en_attente'
    };
    appState.reservations.unshift(reservation);
    enregistrerReservationsPersistantes();
    renderReservationsAdmin();
}

function ajouterDemandeEmpruntPourAdmin(titreLivre) {
    const nom = String(appState.currentUser?.name || '').trim().toLowerCase();
    const email = String(appState.currentUser?.email || '').trim().toLowerCase();
    const titreNormalise = normaliserTexte(titreLivre);

    const dejaEnAttente = (Array.isArray(appState.reservations) ? appState.reservations : []).some(item => {
        if (String(item?.statut || '') !== 'demande_emprunt') return false;
        const memeTitre = normaliserTexte(item?.titreLivre || '') === titreNormalise;
        const memeEtudiant = email
            ? String(item?.etudiantEmail || '').trim().toLowerCase() === email
            : String(item?.etudiantNom || '').trim().toLowerCase() === nom;
        return memeTitre && memeEtudiant;
    });
    if (dejaEnAttente) return false;

    const demande = {
        id: genererIdOperation(),
        etudiantNom: appState.currentUser?.name || 'Étudiant',
        etudiantEmail: appState.currentUser?.email || '',
        titreLivre: titreLivre || 'Livre',
        dateReservation: formaterIso(new Date()),
        statut: 'demande_emprunt'
    };

    appState.reservations.unshift(demande);
    enregistrerReservationsPersistantes();
    renderReservationsAdmin();
    renderTableauxEmprunts();
    return true;
}

function trouverLivreParTitreApprox(livres, titre) {
    const titreRecherche = normaliserTexte(titre || '').replace(/[^a-z0-9]/g, '');
    if (!titreRecherche) return null;

    return (Array.isArray(livres) ? livres : []).find(item => {
        const titreLivre = normaliserTexte(item.titre || '').replace(/[^a-z0-9]/g, '');
        if (!titreLivre) return false;
        return titreLivre === titreRecherche
            || titreLivre.includes(titreRecherche)
            || titreRecherche.includes(titreLivre);
    }) || null;
}

function obtenirDisponibiliteReservation(reservation) {
    const titreRecherche = normaliserTexte(reservation?.titreLivre || '');
    const livreBdd = appState.livresCatalogueBdd.find(item => normaliserTexte(item.titre) === titreRecherche)
        || trouverLivreParTitreApprox(appState.livresCatalogueBdd, reservation?.titreLivre)
        || null;
    if (livreBdd) {
        const stock = Number(livreBdd.stock || 0);
        return {
            disponible: stock > 0,
            texte: stock > 0 ? `${stock} dispo (base)` : 'Indisponible (base)',
            classe: stock > 0 ? 'retourne' : 'en-retard',
            valeurSelect: `db:${livreBdd.id}`
        };
    }

    const livreCatalogue = appState.livresCatalogue.find(item => normaliserTexte(item.titre) === titreRecherche)
        || trouverLivreParTitreApprox(appState.livresCatalogue, reservation?.titreLivre)
        || null;
    if (livreCatalogue) {
        const stock = Number(livreCatalogue.stock || 0);
        return {
            disponible: stock > 0,
            texte: stock > 0 ? `${stock} dispo (catalogue local)` : 'Indisponible (catalogue local)',
            classe: stock > 0 ? 'en-cours' : 'en-retard',
            valeurSelect: `cat:${livreCatalogue.id}`
        };
    }

    return {
        disponible: false,
        texte: 'Livre introuvable',
        classe: 'en-retard',
        valeurSelect: ''
    };
}

function corrigerReservationsLivresIndisponibles() {
    if (!Array.isArray(appState.reservations) || appState.reservations.length === 0) return;

    const sourceLivres = Array.isArray(appState.livresCatalogueBdd) && appState.livresCatalogueBdd.length
        ? appState.livresCatalogueBdd
        : (Array.isArray(appState.livresCatalogue) ? appState.livresCatalogue : []);

    const livresDisponibles = sourceLivres.filter(livre => Number(livre.stock || 0) > 0);
    if (!livresDisponibles.length) return;

    let indexRotation = 0;
    let modifie = false;

    appState.reservations = appState.reservations.map(reservation => {
        if (String(reservation?.statut || '') === 'demande_emprunt') return reservation;
        const disponibilite = obtenirDisponibiliteReservation(reservation);
        if (disponibilite.disponible) return reservation;

        const livreRemplacement = livresDisponibles[indexRotation % livresDisponibles.length];
        indexRotation += 1;
        modifie = true;

        return {
            ...reservation,
            titreLivre: livreRemplacement.titre
        };
    });

    if (modifie) {
        enregistrerReservationsPersistantes();
    }
}

// Affiche la liste des réservations avec disponibilité et action admin.
function renderReservationsAdmin() {
    const body = document.getElementById('reservationsManagementBody');
    if (!body) return;

    corrigerReservationsLivresIndisponibles();
    const reservationsAffichees = (Array.isArray(appState.reservations) ? appState.reservations : [])
        .filter(reservation => String(reservation?.statut || '') !== 'demande_emprunt');

    if (!reservationsAffichees.length) {
        body.innerHTML = '<tr><td colspan="6" class="student-ops-empty">Aucune réservation en attente.</td></tr>';
        return;
    }

    body.innerHTML = reservationsAffichees.map(reservation => {
        const disponibilite = obtenirDisponibiliteReservation(reservation);
        const action = disponibilite.disponible
            ? `<button type="button" class="action-btn btn-return" data-admin-only="true" data-convert-reservation="${echapperHtml(reservation.id)}">
                    <i class="fas fa-hand-holding"></i> Ajouter à l'emprunt
                </button>`
            : `<button type="button" class="action-btn btn-return admin-disabled" disabled title="Livre indisponible">
                    <i class="fas fa-hand-holding"></i> Ajouter à l'emprunt
                </button>`;

        return `
            <tr>
                <td>${echapperHtml(reservation.etudiantNom || 'Étudiant')}</td>
                <td>${echapperHtml(reservation.etudiantEmail || 'N/A')}</td>
                <td>${echapperHtml(reservation.titreLivre || 'Livre')}</td>
                <td>${formaterDateAffichage(reservation.dateReservation)}</td>
                <td><span class="status-pill ${disponibilite.classe}">${echapperHtml(disponibilite.texte)}</span></td>
                <td>${action}</td>
            </tr>
        `;
    }).join('');
    appliquerEtatElementsAdmin();
}

function afficherInfoReservationEmprunt(reservation, disponibilite) {
    const info = document.getElementById('loanReservationInfo');
    if (!info) return;
    info.innerHTML = `<i class="fas fa-info-circle"></i> Réservation de <strong>${echapperHtml(reservation.etudiantNom || 'Étudiant')}</strong> pour <strong>${echapperHtml(reservation.titreLivre || 'Livre')}</strong> — <strong>${echapperHtml(disponibilite.texte)}</strong>.`;
    info.classList.remove('hidden');
}

function masquerInfoReservationEmprunt() {
    const info = document.getElementById('loanReservationInfo');
    if (!info) return;
    info.textContent = '';
    info.classList.add('hidden');
}

// Pré-remplit le formulaire d'emprunt depuis une réservation.
async function preRemplirEmpruntDepuisReservation(reservationId) {
    await chargerLivresDepuisApi();

    const reservation = appState.reservations.find(item => item.id === reservationId);
    if (!reservation) {
        showToast('Réservation', 'Réservation introuvable.');
        return;
    }

    const studentSelect = document.getElementById('loanStudentSelect');
    const bookSelect = document.getElementById('loanBookSelect');
    const start = document.getElementById('loanDateStart');
    const end = document.getElementById('loanDateEnd');

    if (!studentSelect || !bookSelect || !start || !end) return;

    const disponibilite = obtenirDisponibiliteReservation(reservation);
    if (!disponibilite.disponible || !disponibilite.valeurSelect) {
        showToast('Réservation', 'Livre indisponible pour conversion en emprunt.');
        renderReservationsAdmin();
        return;
    }

    const etudiant = appState.etudiants.find(item =>
        (reservation.etudiantEmail && String(item.email || '').toLowerCase() === String(reservation.etudiantEmail).toLowerCase())
        || String(item.nom_complet || '').toLowerCase() === String(reservation.etudiantNom || '').toLowerCase()
    );
    if (etudiant) {
        studentSelect.value = String(etudiant.id);
    }

    bookSelect.value = disponibilite.valeurSelect;

    const aujourdHui = new Date();
    const dateDebut = formaterIso(aujourdHui);
    const dateFin = new Date(aujourdHui);
    dateFin.setDate(dateFin.getDate() + Number(appState.parametresApplication?.dureeMaxEmpruntJours || 30));
    start.value = dateDebut;
    end.value = formaterIso(dateFin);

    appState.reservationAConvertirId = reservation.id;
    afficherInfoReservationEmprunt(reservation, disponibilite);
    openModal('loan');
}

function ajouterOperationEmprunt(livre, dateEmprunt, dateRetourPrevue) {
    const existante = appState.operationsEtudiant.find(op =>
        op.livre === livre && op.statut === 'reserve'
    );

    if (existante) {
        existante.statut = 'emprunte';
        existante.dateEmprunt = dateEmprunt;
        existante.dateRetourPrevue = dateRetourPrevue;
        existante.jourRecuperation = dateEmprunt;
        return;
    }

    appState.operationsEtudiant.unshift({
        id: genererIdOperation(),
        livre,
        statut: 'emprunte',
        jourReservation: dateEmprunt,
        jourRecuperation: dateEmprunt,
        dateEmprunt,
        dateRetourPrevue,
        dateRetourEffective: null
    });
}

function renderOperationsEtudiant() {
    const body = document.getElementById('studentOpsBody');
    if (!body) return;

    if (appState.operationsEtudiant.length === 0) {
        body.innerHTML = '<tr><td colspan="8" class="student-ops-empty">Aucun livre réservé ou emprunté pour le moment.</td></tr>';
        return;
    }

    body.innerHTML = appState.operationsEtudiant.map(operation => {
        const sanction = calculerSanction(operation);
        const statutHtml = operation.statut === 'reserve'
            ? '<span class="status-pill retourne">Réservé</span>'
            : (operation.statut === 'retourne'
                ? '<span class="status-pill retourne">Retourné</span>'
                : '<span class="status-pill en-cours">Emprunté</span>');

        return `
            <tr>
                <td>${echapperHtml(operation.livre)}</td>
                <td>${statutHtml}</td>
                <td>${formaterDateAffichage(operation.jourReservation)}</td>
                <td>${formaterDateAffichage(operation.jourRecuperation)}</td>
                <td>${formaterDateAffichage(operation.dateEmprunt)}</td>
                <td>${formaterDateAffichage(operation.dateRetourPrevue)}</td>
                <td>${formaterDateAffichage(operation.dateRetourEffective)}</td>
                <td>${sanction}</td>
            </tr>
        `;
    }).join('');
    appliquerParametresCompteDansFormulaire();
}

function calculerSanction(operation) {
    if (Number(operation.montantPenalite || 0) > 0) {
        return `${Number(operation.montantPenalite).toFixed(2)} €`;
    }

    if (operation.statut !== 'emprunte' || !operation.dateRetourPrevue || operation.dateRetourEffective) {
        return 'Aucune';
    }

    const retourPrevu = new Date(`${operation.dateRetourPrevue}T00:00:00`);
    const aujourdHui = new Date();
    const diffJours = Math.floor((aujourdHui - retourPrevu) / 86400000);

    if (diffJours <= 0) return 'Aucune';

    const penaliteJour = Number(appState.parametresApplication?.penaliteJournaliere || 1);
    const montant = diffJours * penaliteJour;
    return `${montant.toFixed(2)} € (${diffJours} j retard)`;
}

function formaterDateAffichage(dateIso) {
    if (!dateIso) return '—';
    const brut = String(dateIso);
    const date = brut.includes('T') || brut.includes(' ')
        ? new Date(brut.replace(' ', 'T'))
        : new Date(`${brut}T00:00:00`);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleDateString('fr-FR');
}

function formaterIso(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function echapperHtml(valeur) {
    return String(valeur)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('\"', '&quot;')
        .replaceAll('\'', '&#39;');
}

function genererIdOperation() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
        return window.crypto.randomUUID();
    }
    return `op-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
}

function demarrerHorlogeConnexion() {
    const horloge = document.getElementById('authClock');
    const topbarClock = document.getElementById('topbarClock');
    const topbarClockDesktop = document.getElementById('topbarClockDesktop');
    if (!horloge && !topbarClock && !topbarClockDesktop) return;

    const maj = () => {
        const maintenant = new Date();
        const heure = maintenant.toLocaleTimeString('fr-FR', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
        if (horloge) horloge.textContent = heure;
        if (topbarClock) topbarClock.textContent = heure;
        if (topbarClockDesktop) topbarClockDesktop.textContent = heure;
    };

    maj();
    if (appState.horlogeIntervalId) {
        clearInterval(appState.horlogeIntervalId);
    }
    appState.horlogeIntervalId = setInterval(maj, 1000);
}

// Recharge la session locale si elle est encore valide.
function chargerSessionPersistante() {
    try {
        const brut = localStorage.getItem(STORAGE_SESSION_KEY);
        if (!brut) return null;

        const session = JSON.parse(brut);
        if (!session || typeof session !== 'object') return null;

        const expireLe = Number(session.expireLe || 0);
        if (!expireLe || Date.now() > expireLe) {
            supprimerSessionPersistante();
            return null;
        }

        if (!session.currentUser?.email || !session.currentUser?.name) {
            supprimerSessionPersistante();
            return null;
        }

        return session;
    } catch (error) {
        supprimerSessionPersistante();
        return null;
    }
}

function restaurerSession(session) {
    appState.currentUser = {
        name: String(session.currentUser.name),
        email: String(session.currentUser.email),
        roleNom: String(session.currentUser.roleNom || 'etudiant')
    };
    appState.role = session.role === 'admin' ? 'admin' : 'student';
    appState.activeSection = sectionMap[session.section] ? session.section : 'dashboard';
    appState.sessionExpireLe = Number(session.expireLe);
}

// Enregistre la session utilisateur en local.
function enregistrerSessionPersistante() {
    if (!appState.currentUser || !appState.sessionExpireLe) return;

    const payload = {
        currentUser: appState.currentUser,
        role: appState.role,
        section: appState.activeSection || 'dashboard',
        expireLe: appState.sessionExpireLe
    };
    localStorage.setItem(STORAGE_SESSION_KEY, JSON.stringify(payload));
}

// Supprime la session locale.
function supprimerSessionPersistante() {
    localStorage.removeItem(STORAGE_SESSION_KEY);
}

// Recharge les réservations stockées localement.
function chargerReservationsPersistantes() {
    try {
        const brut = localStorage.getItem(STORAGE_RESERVATIONS_KEY);
        if (!brut) {
            appState.reservations = [];
            return;
        }
        const reservations = JSON.parse(brut);
        appState.reservations = Array.isArray(reservations) ? reservations : [];
    } catch (error) {
        appState.reservations = [];
    }
}

// Sauvegarde les réservations dans le stockage local.
function enregistrerReservationsPersistantes() {
    localStorage.setItem(STORAGE_RESERVATIONS_KEY, JSON.stringify(appState.reservations || []));
}

initApp();
