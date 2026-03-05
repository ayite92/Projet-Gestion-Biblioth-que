<?php
declare(strict_types=1);

require_once __DIR__ . '/utilitaires.php';

exigerMethode('POST');
$utilisateur = exigerConnexion();
$pdo = obtenirConnexionBdd();

$roleNom = mb_strtolower((string) ($utilisateur['role_nom'] ?? ''));
$estCompteAdmin = $roleNom === 'administrateur';
if (!accesAdministrateurValide() && !$estCompteAdmin) {
    envoyerJson(['ok' => false, 'message' => 'Accès administrateur requis.'], 403);
}

$stmt = $pdo->prepare(
    'UPDATE notifications
     SET est_lue = 1, lue_le = NOW()
     WHERE est_lue = 0'
);
$stmt->execute();

envoyerJson(['ok' => true, 'message' => 'Toutes les notifications ont été marquées comme lues.']);
