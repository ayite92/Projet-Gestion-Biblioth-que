<?php
declare(strict_types=1);

require_once __DIR__ . '/utilitaires.php';

exigerMethode('POST');
$utilisateur = exigerConnexion();
$donnees = lireCorpsJson();
$pdo = obtenirConnexionBdd();

$notificationId = (int) ($donnees['notification_id'] ?? 0);
if ($notificationId <= 0) {
    envoyerJson(['ok' => false, 'message' => 'Identifiant notification invalide.'], 422);
}

$roleNom = mb_strtolower((string) ($utilisateur['role_nom'] ?? ''));
$estCompteAdmin = $roleNom === 'administrateur';
if (!accesAdministrateurValide() && !$estCompteAdmin) {
    envoyerJson(['ok' => false, 'message' => 'Accès administrateur requis.'], 403);
}

$stmt = $pdo->prepare(
    'UPDATE notifications
     SET est_lue = 1, lue_le = NOW()
     WHERE id = :id'
);
$stmt->execute(['id' => $notificationId]);

envoyerJson(['ok' => true, 'message' => 'Notification marquée comme lue.']);
