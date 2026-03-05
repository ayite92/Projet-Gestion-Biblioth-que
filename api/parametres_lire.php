<?php
declare(strict_types=1);

require_once __DIR__ . '/utilitaires.php';

exigerMethode('GET');
exigerConnexion();

$pdo = obtenirConnexionBdd();
$stmt = $pdo->query(
    'SELECT cle, valeur
     FROM parametres_application
     WHERE cle IN ("duree_max_emprunt_jours", "montant_penalite_journalier", "quota_max_emprunts_actifs")'
);

$parametres = [
    'duree_max_emprunt_jours' => '30',
    'montant_penalite_journalier' => '1.00',
    'quota_max_emprunts_actifs' => '3',
];

foreach ($stmt->fetchAll() as $ligne) {
    $cle = (string) ($ligne['cle'] ?? '');
    if ($cle === '') continue;
    $parametres[$cle] = (string) ($ligne['valeur'] ?? $parametres[$cle] ?? '');
}

envoyerJson([
    'ok' => true,
    'parametres' => $parametres,
]);
