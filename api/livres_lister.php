<?php
declare(strict_types=1);

require_once __DIR__ . '/utilitaires.php';

exigerMethode('GET');
exigerConnexion();

$pdo = obtenirConnexionBdd();
$stmt = $pdo->query(
    'SELECT l.id, l.isbn, l.titre, l.auteur, l.editeur, l.annee_publication,
            l.nombre_total_exemplaires, l.nombre_exemplaires_disponibles, l.code_emplacement,
            l.statut, c.nom AS categorie_nom
     FROM livres l
     LEFT JOIN categories_livres c ON c.id = l.categorie_id
     ORDER BY l.titre ASC'
);

$livres = $stmt->fetchAll();

envoyerJson(['ok' => true, 'livres' => $livres]);
