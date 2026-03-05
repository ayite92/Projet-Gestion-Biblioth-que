<?php
declare(strict_types=1);

require_once __DIR__ . '/utilitaires.php';

exigerMethode('GET');
$utilisateur = exigerConnexion();
$pdo = obtenirConnexionBdd();

$roleNom = mb_strtolower((string) ($utilisateur['role_nom'] ?? ''));
$estCompteAdmin = $roleNom === 'administrateur';

if (accesAdministrateurValide() || $estCompteAdmin) {
    $stmt = $pdo->query(
        'SELECT id, utilisateur_id, titre, message, type, est_lue, cree_le, lue_le
         FROM notifications
         ORDER BY cree_le DESC
         LIMIT 200'
    );
    envoyerJson(['ok' => true, 'mode' => 'admin', 'notifications' => $stmt->fetchAll()]);
}

$stmt = $pdo->prepare(
    'SELECT id, utilisateur_id, titre, message, type, est_lue, cree_le, lue_le
     FROM notifications
     WHERE utilisateur_id IS NULL OR utilisateur_id = :utilisateur_id
     ORDER BY cree_le DESC
     LIMIT 200'
);
$stmt->execute(['utilisateur_id' => (int) $utilisateur['id']]);

envoyerJson(['ok' => true, 'mode' => 'adherent', 'notifications' => $stmt->fetchAll()]);
