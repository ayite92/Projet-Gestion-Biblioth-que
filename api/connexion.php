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
$emailBanni = 'email.bibliotheque@esgis.org';

if ($email === '' || $motDePasse === '') {
    envoyerJson(['ok' => false, 'message' => 'Email et mot de passe requis.'], 422);
}

if ($email === $emailBanni) {
    envoyerJson(['ok' => false, 'message' => 'Ce compte est désactivé.'], 403);
}

$pdo = obtenirConnexionBdd();

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
