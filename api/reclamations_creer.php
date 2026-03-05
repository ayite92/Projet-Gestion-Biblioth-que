<?php
declare(strict_types=1);

require_once __DIR__ . '/utilitaires.php';

exigerMethode('POST');
$utilisateur = exigerConnexion();
$donnees = lireCorpsJson();

$objet = trim((string) ($donnees['objet'] ?? ''));
$description = trim((string) ($donnees['description'] ?? ''));
$categorie = trim((string) ($donnees['categorie'] ?? 'autre'));
$priorite = trim((string) ($donnees['priorite'] ?? 'moyenne'));

$categoriesAutorisees = ['probleme_emprunt', 'livre_endommage', 'contestation_penalite', 'probleme_compte', 'autre'];
$prioritesAutorisees = ['basse', 'moyenne', 'haute', 'urgente'];

if ($objet === '' || $description === '') {
    envoyerJson(['ok' => false, 'message' => 'Objet et description sont requis.'], 422);
}

if (!in_array($categorie, $categoriesAutorisees, true)) {
    $categorie = 'autre';
}
if (!in_array($priorite, $prioritesAutorisees, true)) {
    $priorite = 'moyenne';
}

$pdo = obtenirConnexionBdd();
$stmtEtudiant = $pdo->prepare('SELECT id FROM etudiants WHERE utilisateur_id = :utilisateur_id LIMIT 1');
$stmtEtudiant->execute(['utilisateur_id' => (int) $utilisateur['id']]);
$etudiant = $stmtEtudiant->fetch();

if (!$etudiant) {
    envoyerJson(['ok' => false, 'message' => 'Profil étudiant introuvable pour cet utilisateur.'], 404);
}

$stmt = $pdo->prepare(
    'INSERT INTO reclamations (etudiant_id, objet, description, categorie, priorite)
     VALUES (:etudiant_id, :objet, :description, :categorie, :priorite)'
);

$stmt->execute([
    'etudiant_id' => (int) $etudiant['id'],
    'objet' => $objet,
    'description' => $description,
    'categorie' => $categorie,
    'priorite' => $priorite,
]);

$reclamationId = (int) $pdo->lastInsertId();

enregistrerJournalAudit('creation_reclamation', 'reclamations', $reclamationId, 'Création d\'une réclamation', (int) $utilisateur['id']);

envoyerJson([
    'ok' => true,
    'message' => 'Réclamation créée avec succès.',
    'reclamation_id' => $reclamationId,
], 201);
