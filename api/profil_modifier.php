<?php
declare(strict_types=1);

require_once __DIR__ . '/utilitaires.php';

exigerMethode('POST');
$utilisateur = exigerConnexion();
$donnees = lireCorpsJson();

$nomComplet = trim((string) ($donnees['nom_complet'] ?? ''));
$email = mb_strtolower(trim((string) ($donnees['email'] ?? '')));

if ($nomComplet === '' || $email === '') {
    envoyerJson(['ok' => false, 'message' => 'Nom et email sont obligatoires.'], 422);
}

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    envoyerJson(['ok' => false, 'message' => 'Email invalide.'], 422);
}

$pdo = obtenirConnexionBdd();

$stmtEmail = $pdo->prepare(
    'SELECT id FROM utilisateurs WHERE email = :email AND id <> :id LIMIT 1'
);
$stmtEmail->execute([
    'email' => $email,
    'id' => (int) $utilisateur['id'],
]);

if ($stmtEmail->fetch()) {
    envoyerJson(['ok' => false, 'message' => 'Cet email est déjà utilisé.'], 409);
}

$stmtMaj = $pdo->prepare(
    'UPDATE utilisateurs
     SET nom_complet = :nom_complet, email = :email
     WHERE id = :id'
);
$stmtMaj->execute([
    'nom_complet' => $nomComplet,
    'email' => $email,
    'id' => (int) $utilisateur['id'],
]);

demarrerSessionSiBesoin();
if (!empty($_SESSION['utilisateur']) && (int) ($_SESSION['utilisateur']['id'] ?? 0) === (int) $utilisateur['id']) {
    $_SESSION['utilisateur']['nom_complet'] = $nomComplet;
    $_SESSION['utilisateur']['email'] = $email;
}

enregistrerJournalAudit(
    'modification_profil',
    'utilisateurs',
    (int) $utilisateur['id'],
    'Mise à jour du profil utilisateur',
    (int) $utilisateur['id']
);

envoyerJson([
    'ok' => true,
    'message' => 'Profil mis à jour.',
    'utilisateur' => [
        'id' => (int) $utilisateur['id'],
        'nom_complet' => $nomComplet,
        'email' => $email,
    ],
]);
