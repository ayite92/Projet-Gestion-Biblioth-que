<?php
declare(strict_types=1);

require_once __DIR__ . '/utilitaires.php';

exigerMethode('POST');
$utilisateur = exigerConnexion();
$donnees = lireCorpsJson();
$pdo = obtenirConnexionBdd();

$titre = trim((string) ($donnees['titre'] ?? 'Notification'));
$message = trim((string) ($donnees['message'] ?? ''));
$type = trim((string) ($donnees['type'] ?? 'info'));
$global = (bool) ($donnees['global'] ?? false);

if ($message === '') {
    envoyerJson(['ok' => false, 'message' => 'Message notification requis.'], 422);
}

$typesAutorises = ['info', 'succes', 'alerte', 'danger'];
if (!in_array($type, $typesAutorises, true)) {
    $type = 'info';
}

$utilisateurId = $global ? null : (int) $utilisateur['id'];

if ($global) {
    $roleNom = mb_strtolower((string) ($utilisateur['role_nom'] ?? ''));
    $estCompteAdmin = $roleNom === 'administrateur';
    if (!accesAdministrateurValide() && !$estCompteAdmin) {
        envoyerJson(['ok' => false, 'message' => 'Accès administrateur requis.'], 403);
    }
}

$stmt = $pdo->prepare(
    'INSERT INTO notifications (utilisateur_id, titre, message, type, est_lue)
     VALUES (:utilisateur_id, :titre, :message, :type, 0)'
);
$stmt->bindValue('utilisateur_id', $utilisateurId, $utilisateurId === null ? PDO::PARAM_NULL : PDO::PARAM_INT);
$stmt->execute([
    'titre' => $titre !== '' ? $titre : 'Notification',
    'message' => $message,
    'type' => $type,
]);

envoyerJson(['ok' => true, 'message' => 'Notification créée.'], 201);
