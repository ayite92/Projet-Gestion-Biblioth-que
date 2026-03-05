<?php
declare(strict_types=1);

require_once __DIR__ . '/config.php';

function obtenirConnexionBdd(): PDO
{
    static $pdo = null;

    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $dsn = sprintf('mysql:host=%s;port=%s;dbname=%s;charset=utf8mb4', BDD_HOTE, BDD_PORT, BDD_NOM);

    $pdo = new PDO($dsn, BDD_UTILISATEUR, BDD_MOT_DE_PASSE, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);

    return $pdo;
}
