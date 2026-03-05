<?php
declare(strict_types=1);

require_once __DIR__ . '/utilitaires.php';

exigerMethode('GET');
$utilisateur = exigerConnexion();

$pdo = obtenirConnexionBdd();

if (accesAdministrateurValide()) {
    $stmt = $pdo->query(
        'SELECT r.id, r.objet, r.description, r.categorie, r.priorite, r.statut,
                r.cree_le, r.modifie_le, r.resolue_le,
                e.matricule,
                u.nom_complet AS etudiant_nom,
                ua.nom_complet AS admin_assigne_nom
         FROM reclamations r
         INNER JOIN etudiants e ON e.id = r.etudiant_id
         LEFT JOIN utilisateurs u ON u.id = e.utilisateur_id
         LEFT JOIN utilisateurs ua ON ua.id = r.admin_assigne_id
         ORDER BY r.cree_le DESC'
    );
    $reclamations = $stmt->fetchAll();

    envoyerJson(['ok' => true, 'mode' => 'admin', 'reclamations' => $reclamations]);
}

$stmtEtudiant = $pdo->prepare('SELECT id FROM etudiants WHERE utilisateur_id = :utilisateur_id LIMIT 1');
$stmtEtudiant->execute(['utilisateur_id' => (int) $utilisateur['id']]);
$etudiant = $stmtEtudiant->fetch();

if (!$etudiant) {
    envoyerJson(['ok' => true, 'mode' => 'etudiant', 'reclamations' => []]);
}

$stmt = $pdo->prepare(
    'SELECT id, objet, description, categorie, priorite, statut, cree_le, modifie_le, resolue_le
     FROM reclamations
     WHERE etudiant_id = :etudiant_id
     ORDER BY cree_le DESC'
);
$stmt->execute(['etudiant_id' => (int) $etudiant['id']]);

$reclamations = $stmt->fetchAll();

envoyerJson(['ok' => true, 'mode' => 'etudiant', 'reclamations' => $reclamations]);
