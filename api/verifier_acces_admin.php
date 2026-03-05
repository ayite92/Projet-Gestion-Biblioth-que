<?php
declare(strict_types=1);

require_once __DIR__ . '/utilitaires.php';

exigerMethode('POST');
$utilisateurSession = exigerConnexion();
$donnees = lireCorpsJson();

$identifiantAdmin = trim((string) ($donnees['identifiant_admin'] ?? ''));
$motDePasseAdmin = (string) ($donnees['mot_de_passe_admin'] ?? '');
$codeSecurite = trim((string) ($donnees['code_securite'] ?? ''));

if ($identifiantAdmin === '' || $motDePasseAdmin === '' || $codeSecurite === '') {
    envoyerJson(['ok' => false, 'message' => 'Identifiant admin, mot de passe admin et code sécurité requis.'], 422);
}

if (
    $identifiantAdmin === DEMO_ADMIN_IDENTIFIANT
    && $motDePasseAdmin === DEMO_ADMIN_MOT_DE_PASSE
    && $codeSecurite === DEMO_ADMIN_CODE
) {
    demarrerSessionSiBesoin();
    $_SESSION['acces_admin_valide'] = true;
    $_SESSION['admin_utilisateur_id'] = (int) $utilisateurSession['id'];

    envoyerJson([
        'ok' => true,
        'message' => 'Accès administrateur validé.',
        'administrateur' => [
            'id' => (int) $utilisateurSession['id'],
            'nom_complet' => (string) ($utilisateurSession['nom_complet'] ?? DEMO_COMPTE_NOM),
            'email' => (string) ($utilisateurSession['email'] ?? DEMO_COMPTE_EMAIL),
        ],
    ]);
}

$pdo = obtenirConnexionBdd();
$stmt = $pdo->prepare(
    'SELECT u.id, u.nom_complet, u.email, u.mot_de_passe_hash, pa.code_securite_hash
     FROM profils_administrateurs pa
     INNER JOIN utilisateurs u ON u.id = pa.utilisateur_id
     INNER JOIN roles r ON r.id = u.role_id
     WHERE pa.identifiant_admin = :identifiant_admin
       AND r.nom = :role_admin
       AND u.est_actif = 1
     LIMIT 1'
);
$stmt->execute([
    'identifiant_admin' => $identifiantAdmin,
    'role_admin' => 'administrateur',
]);
$admin = $stmt->fetch();

if (!$admin) {
    envoyerJson(['ok' => false, 'message' => 'Identifiant administrateur invalide.'], 401);
}

$motDePasseOk = password_verify($motDePasseAdmin, (string) $admin['mot_de_passe_hash']);
$codeOk = password_verify($codeSecurite, (string) $admin['code_securite_hash']);

if (!$motDePasseOk || !$codeOk) {
    envoyerJson(['ok' => false, 'message' => 'Vérification administrateur échouée.'], 401);
}

demarrerSessionSiBesoin();
$_SESSION['acces_admin_valide'] = true;
$_SESSION['admin_utilisateur_id'] = (int) $admin['id'];

enregistrerJournalAudit(
    'verification_admin',
    'profils_administrateurs',
    (int) $admin['id'],
    'Accès administrateur validé pour un utilisateur connecté.',
    (int) $utilisateurSession['id']
);

envoyerJson([
    'ok' => true,
    'message' => 'Accès administrateur validé.',
    'administrateur' => [
        'id' => (int) $admin['id'],
        'nom_complet' => (string) $admin['nom_complet'],
        'email' => (string) $admin['email'],
    ],
]);
