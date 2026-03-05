<?php
declare(strict_types=1);

require_once __DIR__ . '/utilitaires.php';

exigerMethode('POST');
$utilisateur = exigerConnexion();
exigerAccesAdministrateur();
$donnees = lireCorpsJson();

$livreId = (int) ($donnees['livre_id'] ?? 0);
if ($livreId <= 0) {
    envoyerJson(['ok' => false, 'message' => 'livre_id invalide.'], 422);
}

$pdo = obtenirConnexionBdd();
$stmtLivre = $pdo->prepare('SELECT * FROM livres WHERE id = :id LIMIT 1');
$stmtLivre->execute(['id' => $livreId]);
$livreActuel = $stmtLivre->fetch();

if (!$livreActuel) {
    envoyerJson(['ok' => false, 'message' => 'Livre introuvable.'], 404);
}

$champsAutorises = [
    'titre', 'auteur', 'editeur', 'annee_publication', 'categorie_id',
    'nombre_total_exemplaires', 'nombre_exemplaires_disponibles', 'code_emplacement', 'statut'
];

$modifs = [];
$params = ['id' => $livreId];

foreach ($champsAutorises as $champ) {
    if (!array_key_exists($champ, $donnees)) {
        continue;
    }

    $valeur = $donnees[$champ];

    if (in_array($champ, ['nombre_total_exemplaires', 'nombre_exemplaires_disponibles', 'annee_publication', 'categorie_id'], true)) {
        $valeur = is_numeric((string) $valeur) ? (int) $valeur : null;
    } elseif (is_string($valeur)) {
        $valeur = trim($valeur);
        if ($valeur === '') {
            $valeur = null;
        }
    }

    $modifs[] = "$champ = :$champ";
    $params[$champ] = $valeur;
}

if (!$modifs) {
    envoyerJson(['ok' => false, 'message' => 'Aucune modification fournie.'], 422);
}

$total = array_key_exists('nombre_total_exemplaires', $params)
    ? (int) $params['nombre_total_exemplaires']
    : (int) $livreActuel['nombre_total_exemplaires'];

$dispo = array_key_exists('nombre_exemplaires_disponibles', $params)
    ? (int) $params['nombre_exemplaires_disponibles']
    : (int) $livreActuel['nombre_exemplaires_disponibles'];

if ($total < 1 || $dispo < 0 || $dispo > $total) {
    envoyerJson(['ok' => false, 'message' => 'Stock invalide après mise à jour.'], 422);
}

if (!array_key_exists('statut', $params)) {
    $params['statut'] = $dispo > 0 ? 'disponible' : 'rupture';
    $modifs[] = 'statut = :statut';
}

$pdo->beginTransaction();

try {
    $sql = 'UPDATE livres SET ' . implode(', ', $modifs) . ' WHERE id = :id';
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);

    $stmtJournal = $pdo->prepare(
        'INSERT INTO journal_modifications_livres (livre_id, admin_id, type_modification, anciennes_valeurs, nouvelles_valeurs, note)
         VALUES (:livre_id, :admin_id, :type_modification, :anciennes_valeurs, :nouvelles_valeurs, :note)'
    );

    $stmtJournal->execute([
        'livre_id' => $livreId,
        'admin_id' => (int) ($_SESSION['admin_utilisateur_id'] ?? $utilisateur['id']),
        'type_modification' => 'mise_a_jour',
        'anciennes_valeurs' => json_encode($livreActuel, JSON_UNESCAPED_UNICODE),
        'nouvelles_valeurs' => json_encode($params, JSON_UNESCAPED_UNICODE),
        'note' => 'Modification d\'un livre.',
    ]);

    $pdo->commit();

    enregistrerJournalAudit('mise_a_jour_livre', 'livres', $livreId, 'Mise à jour d\'un livre', (int) $utilisateur['id']);

    envoyerJson(['ok' => true, 'message' => 'Livre mis à jour.']);
} catch (Throwable $e) {
    $pdo->rollBack();
    envoyerJson(['ok' => false, 'message' => 'Impossible de modifier le livre.', 'erreur' => $e->getMessage()], 500);
}
