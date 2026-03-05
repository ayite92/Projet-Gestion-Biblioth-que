<?php
declare(strict_types=1);

require_once __DIR__ . '/utilitaires.php';

exigerMethode('GET');
$utilisateur = exigerConnexion();

envoyerJson([
    'ok' => true,
    'connecte' => true,
    'utilisateur' => $utilisateur,
    'acces_admin_valide' => accesAdministrateurValide(),
]);
