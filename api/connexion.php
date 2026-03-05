<?php
declare(strict_types=1);

require_once __DIR__ . '/utilitaires.php';

$methode = strtoupper($_SERVER['REQUEST_METHOD'] ?? '');
if (!in_array($methode, ['POST', 'GET'], true)) {
    envoyerJson(['ok' => false, 'message' => 'Méthode HTTP non autorisée.'], 405);
}

$donnees = $methode === 'POST' ? lireCorpsJson() : $_GET;

$email = mb_strtolower(trim((string) ($donnees['email'] ?? '')));
$motDePasse = (string) ($donnees['mot_de_passe'] ?? '');

if ($email === '' || $motDePasse === '') {
    envoyerJson(['ok' => false, 'message' => 'Email et mot de passe requis.'], 422);
}

$pdo = obtenirConnexionBdd();

if ($email === DEMO_COMPTE_EMAIL && $motDePasse === DEMO_COMPTE_MOT_DE_PASSE) {
    $roleAdminId = idRoleParNom($pdo, 'administrateur');
    if (!$roleAdminId) {
        envoyerJson(['ok' => false, 'message' => 'Rôle administrateur introuvable.'], 500);
    }

    $hashMotDePasseDemo = password_hash(DEMO_COMPTE_MOT_DE_PASSE, PASSWORD_DEFAULT);
    $hashCodeDemo = password_hash(DEMO_ADMIN_CODE, PASSWORD_DEFAULT);

    $pdo->beginTransaction();
    try {
        $stmtDemo = $pdo->prepare('SELECT id FROM utilisateurs WHERE email = :email LIMIT 1');
        $stmtDemo->execute(['email' => DEMO_COMPTE_EMAIL]);
        $demo = $stmtDemo->fetch();

        if ($demo) {
            $utilisateurDemoId = (int) $demo['id'];
            $stmtMajDemo = $pdo->prepare(
                'UPDATE utilisateurs
                 SET nom_complet = :nom_complet, mot_de_passe_hash = :mot_de_passe_hash, role_id = :role_id, est_actif = 1
                 WHERE id = :id'
            );
            $stmtMajDemo->execute([
                'nom_complet' => DEMO_COMPTE_NOM,
                'mot_de_passe_hash' => $hashMotDePasseDemo,
                'role_id' => $roleAdminId,
                'id' => $utilisateurDemoId,
            ]);
        } else {
            $stmtInsertDemo = $pdo->prepare(
                'INSERT INTO utilisateurs (nom_complet, email, mot_de_passe_hash, role_id, est_actif)
                 VALUES (:nom_complet, :email, :mot_de_passe_hash, :role_id, 1)'
            );
            $stmtInsertDemo->execute([
                'nom_complet' => DEMO_COMPTE_NOM,
                'email' => DEMO_COMPTE_EMAIL,
                'mot_de_passe_hash' => $hashMotDePasseDemo,
                'role_id' => $roleAdminId,
            ]);
            $utilisateurDemoId = (int) $pdo->lastInsertId();
        }

        $stmtAdminProfil = $pdo->prepare('SELECT id FROM profils_administrateurs WHERE utilisateur_id = :utilisateur_id LIMIT 1');
        $stmtAdminProfil->execute(['utilisateur_id' => $utilisateurDemoId]);
        $profilAdmin = $stmtAdminProfil->fetch();

        if ($profilAdmin) {
            $stmtMajProfil = $pdo->prepare(
                'UPDATE profils_administrateurs
                 SET identifiant_admin = :identifiant_admin, code_securite_hash = :code_securite_hash
                 WHERE utilisateur_id = :utilisateur_id'
            );
            $stmtMajProfil->execute([
                'identifiant_admin' => DEMO_ADMIN_IDENTIFIANT,
                'code_securite_hash' => $hashCodeDemo,
                'utilisateur_id' => $utilisateurDemoId,
            ]);
        } else {
            $stmtInsertProfil = $pdo->prepare(
                'INSERT INTO profils_administrateurs (utilisateur_id, identifiant_admin, code_securite_hash)
                 VALUES (:utilisateur_id, :identifiant_admin, :code_securite_hash)'
            );
            $stmtInsertProfil->execute([
                'utilisateur_id' => $utilisateurDemoId,
                'identifiant_admin' => DEMO_ADMIN_IDENTIFIANT,
                'code_securite_hash' => $hashCodeDemo,
            ]);
        }

        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        envoyerJson(['ok' => false, 'message' => 'Impossible de préparer le compte démo.', 'erreur' => $e->getMessage()], 500);
    }
}

$stmt = $pdo->prepare(
    'SELECT u.id, u.nom_complet, u.email, u.mot_de_passe_hash, u.est_actif, r.nom AS role_nom
     FROM utilisateurs u
     INNER JOIN roles r ON r.id = u.role_id
     WHERE u.email = :email
     LIMIT 1'
);
$stmt->execute(['email' => $email]);
$utilisateur = $stmt->fetch();

if (!$utilisateur || !password_verify($motDePasse, (string) $utilisateur['mot_de_passe_hash'])) {
    envoyerJson(['ok' => false, 'message' => 'Email ou mot de passe invalide.'], 401);
}

if ((int) $utilisateur['est_actif'] !== 1) {
    envoyerJson(['ok' => false, 'message' => 'Compte inactif.'], 403);
}

demarrerSessionSiBesoin();
$_SESSION['utilisateur'] = [
    'id' => (int) $utilisateur['id'],
    'nom_complet' => (string) $utilisateur['nom_complet'],
    'email' => (string) $utilisateur['email'],
    'role_nom' => (string) $utilisateur['role_nom'],
];
$_SESSION['acces_admin_valide'] = false;
$_SESSION['admin_utilisateur_id'] = null;

$stmtMaj = $pdo->prepare('UPDATE utilisateurs SET derniere_connexion_le = NOW() WHERE id = :id');
$stmtMaj->execute(['id' => (int) $utilisateur['id']]);

enregistrerJournalAudit('connexion', 'utilisateurs', (int) $utilisateur['id'], 'Connexion utilisateur', (int) $utilisateur['id']);

envoyerJson([
    'ok' => true,
    'message' => 'Connexion réussie.',
    'utilisateur' => [
        'id' => (int) $utilisateur['id'],
        'nom_complet' => (string) $utilisateur['nom_complet'],
        'email' => (string) $utilisateur['email'],
        'role_nom' => (string) $utilisateur['role_nom'],
        'acces_admin_valide' => false,
    ],
]);
