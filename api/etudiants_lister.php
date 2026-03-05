<?php
declare(strict_types=1);

require_once __DIR__ . '/utilitaires.php';

exigerMethode('GET');
$utilisateur = exigerConnexion();

$pdo = obtenirConnexionBdd();

if (accesAdministrateurValide()) {
    $stmt = $pdo->query(
        'SELECT e.id, e.matricule, e.filiere, e.niveau, e.date_inscription, e.statut,
                u.id AS utilisateur_id, u.nom_complet, u.email, r.nom AS role_nom,
                COALESCE(SUM(CASE WHEN em.statut IN ("en_cours", "en_retard") THEN 1 ELSE 0 END), 0) AS nb_emprunts_actifs
         FROM etudiants e
         LEFT JOIN utilisateurs u ON u.id = e.utilisateur_id
         LEFT JOIN roles r ON r.id = u.role_id
         LEFT JOIN emprunts em ON em.etudiant_id = e.id
         WHERE e.statut = "actif"
           AND (u.id IS NULL OR u.est_actif = 1)
         GROUP BY e.id
         ORDER BY u.nom_complet ASC'
    );

    envoyerJson(['ok' => true, 'mode' => 'admin', 'etudiants' => $stmt->fetchAll()]);
}

$stmt = $pdo->prepare(
    'SELECT e.id, e.matricule, e.filiere, e.niveau, e.date_inscription, e.statut,
            u.id AS utilisateur_id, u.nom_complet, u.email, r.nom AS role_nom,
            COALESCE(SUM(CASE WHEN em.statut IN ("en_cours", "en_retard") THEN 1 ELSE 0 END), 0) AS nb_emprunts_actifs
     FROM etudiants e
     INNER JOIN utilisateurs u ON u.id = e.utilisateur_id
     LEFT JOIN roles r ON r.id = u.role_id
     LEFT JOIN emprunts em ON em.etudiant_id = e.id
     WHERE e.utilisateur_id = :utilisateur_id
       AND e.statut = "actif"
       AND u.est_actif = 1
     GROUP BY e.id
     LIMIT 1'
);
$stmt->execute(['utilisateur_id' => (int) $utilisateur['id']]);
$etudiant = $stmt->fetch();

envoyerJson(['ok' => true, 'mode' => 'etudiant', 'etudiants' => $etudiant ? [$etudiant] : []]);
