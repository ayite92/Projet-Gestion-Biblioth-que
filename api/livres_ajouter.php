<?php
declare(strict_types=1);

require_once __DIR__ . '/utilitaires.php';

exigerMethode('POST');
$utilisateur = exigerConnexion();
exigerAccesAdministrateur();
$donnees = lireCorpsJson();

$isbn = trim((string) ($donnees['isbn'] ?? ''));
$titre = trim((string) ($donnees['titre'] ?? ''));
$auteur = trim((string) ($donnees['auteur'] ?? ''));
$editeur = trim((string) ($donnees['editeur'] ?? ''));
$anneePublication = $donnees['annee_publication'] ?? null;
$categorieId = $donnees['categorie_id'] ?? null;
$nombreTotal = (int) ($donnees['nombre_total_exemplaires'] ?? 1);
$nombreDisponible = (int) ($donnees['nombre_exemplaires_disponibles'] ?? $nombreTotal);
$codeEmplacement = trim((string) ($donnees['code_emplacement'] ?? ''));

if ($isbn === '' || $titre === '' || $auteur === '') {
    envoyerJson(['ok' => false, 'message' => 'ISBN, titre et auteur sont obligatoires.'], 422);
}

if ($nombreTotal < 1 || $nombreDisponible < 0 || $nombreDisponible > $nombreTotal) {
    envoyerJson(['ok' => false, 'message' => 'Stock invalide.'], 422);
}

$statut = $nombreDisponible > 0 ? 'disponible' : 'rupture';

$pdo = obtenirConnexionBdd();
$pdo->beginTransaction();

try {
    $stmt = $pdo->prepare(
        'INSERT INTO livres (
            isbn, titre, auteur, editeur, annee_publication, categorie_id,
            nombre_total_exemplaires, nombre_exemplaires_disponibles, code_emplacement, statut
         ) VALUES (
            :isbn, :titre, :auteur, :editeur, :annee_publication, :categorie_id,
            :nombre_total_exemplaires, :nombre_exemplaires_disponibles, :code_emplacement, :statut
         )'
    );

    $stmt->execute([
        'isbn' => $isbn,
        'titre' => $titre,
        'auteur' => $auteur,
        'editeur' => $editeur !== '' ? $editeur : null,
        'annee_publication' => is_numeric((string) $anneePublication) ? (int) $anneePublication : null,
        'categorie_id' => is_numeric((string) $categorieId) ? (int) $categorieId : null,
        'nombre_total_exemplaires' => $nombreTotal,
        'nombre_exemplaires_disponibles' => $nombreDisponible,
        'code_emplacement' => $codeEmplacement !== '' ? $codeEmplacement : null,
        'statut' => $statut,
    ]);

    $livreId = (int) $pdo->lastInsertId();

    $stmtJournal = $pdo->prepare(
        'INSERT INTO journal_modifications_livres (livre_id, admin_id, type_modification, nouvelles_valeurs, note)
         VALUES (:livre_id, :admin_id, :type_modification, :nouvelles_valeurs, :note)'
    );

    $stmtJournal->execute([
        'livre_id' => $livreId,
        'admin_id' => (int) ($_SESSION['admin_utilisateur_id'] ?? $utilisateur['id']),
        'type_modification' => 'creation',
        'nouvelles_valeurs' => json_encode([
            'isbn' => $isbn,
            'titre' => $titre,
            'auteur' => $auteur,
            'nombre_total_exemplaires' => $nombreTotal,
            'nombre_exemplaires_disponibles' => $nombreDisponible,
        ], JSON_UNESCAPED_UNICODE),
        'note' => 'Ajout d\'un nouveau livre.',
    ]);

    $pdo->commit();

    enregistrerJournalAudit('ajout_livre', 'livres', $livreId, 'Ajout d\'un livre', (int) $utilisateur['id']);

    envoyerJson([
        'ok' => true,
        'message' => 'Livre ajouté avec succès.',
        'livre_id' => $livreId,
    ], 201);
} catch (Throwable $e) {
    $pdo->rollBack();
    envoyerJson(['ok' => false, 'message' => 'Impossible d\'ajouter le livre.', 'erreur' => $e->getMessage()], 500);
}
