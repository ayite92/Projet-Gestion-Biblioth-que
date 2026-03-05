<?php
declare(strict_types=1);

require_once __DIR__ . '/utilitaires.php';

exigerMethode('GET');
$utilisateur = exigerConnexion();

$pdo = obtenirConnexionBdd();

if (accesAdministrateurValide()) {
    $stmt = $pdo->query(
        'SELECT em.id, em.livre_id, em.etudiant_id, em.date_emprunt, em.date_retour_prevue,
                em.date_retour_effective, em.statut, em.montant_penalite,
                l.titre AS titre_livre,
                e.matricule,
                u.nom_complet AS nom_etudiant
         FROM emprunts em
         INNER JOIN livres l ON l.id = em.livre_id
         INNER JOIN etudiants e ON e.id = em.etudiant_id
         LEFT JOIN utilisateurs u ON u.id = e.utilisateur_id
         ORDER BY em.cree_le DESC'
    );

    envoyerJson(['ok' => true, 'mode' => 'admin', 'emprunts' => $stmt->fetchAll()]);
}

$stmtEtudiant = $pdo->prepare('SELECT id FROM etudiants WHERE utilisateur_id = :utilisateur_id LIMIT 1');
$stmtEtudiant->execute(['utilisateur_id' => (int) $utilisateur['id']]);
$etudiant = $stmtEtudiant->fetch();

if (!$etudiant) {
    envoyerJson(['ok' => true, 'mode' => 'etudiant', 'emprunts' => []]);
}

$stmt = $pdo->prepare(
    'SELECT em.id, em.livre_id, em.etudiant_id, em.date_emprunt, em.date_retour_prevue,
            em.date_retour_effective, em.statut, em.montant_penalite,
            l.titre AS titre_livre,
            e.matricule,
            u.nom_complet AS nom_etudiant
     FROM emprunts em
     INNER JOIN livres l ON l.id = em.livre_id
     INNER JOIN etudiants e ON e.id = em.etudiant_id
     LEFT JOIN utilisateurs u ON u.id = e.utilisateur_id
     WHERE em.etudiant_id = :etudiant_id
     ORDER BY em.cree_le DESC'
);
$stmt->execute(['etudiant_id' => (int) $etudiant['id']]);

envoyerJson(['ok' => true, 'mode' => 'etudiant', 'emprunts' => $stmt->fetchAll()]);
