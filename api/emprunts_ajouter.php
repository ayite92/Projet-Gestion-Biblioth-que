<?php
declare(strict_types=1);

require_once __DIR__ . '/utilitaires.php';

exigerMethode('POST');
$utilisateur = exigerConnexion();
exigerAccesAdministrateur();
$donnees = lireCorpsJson();

$etudiantId = (int) ($donnees['etudiant_id'] ?? 0);
$livreId = (int) ($donnees['livre_id'] ?? 0);
$dateEmprunt = trim((string) ($donnees['date_emprunt'] ?? ''));
$dateRetourPrevue = trim((string) ($donnees['date_retour_prevue'] ?? ''));

if ($etudiantId <= 0 || $livreId <= 0 || $dateEmprunt === '' || $dateRetourPrevue === '') {
    envoyerJson(['ok' => false, 'message' => 'Données d\'emprunt incomplètes.'], 422);
}

if ($dateRetourPrevue < $dateEmprunt) {
    envoyerJson(['ok' => false, 'message' => 'Date retour prévue invalide.'], 422);
}

$pdo = obtenirConnexionBdd();
$adminId = (int) ($_SESSION['admin_utilisateur_id'] ?? $utilisateur['id']);

$pdo->beginTransaction();
try {
    $stmtLivre = $pdo->prepare('SELECT id, titre, nombre_exemplaires_disponibles FROM livres WHERE id = :id LIMIT 1');
    $stmtLivre->execute(['id' => $livreId]);
    $livre = $stmtLivre->fetch();
    if (!$livre) {
        envoyerJson(['ok' => false, 'message' => 'Livre introuvable.'], 404);
    }

    if ((int) $livre['nombre_exemplaires_disponibles'] <= 0) {
        envoyerJson(['ok' => false, 'message' => 'Aucun exemplaire disponible.'], 409);
    }

    $stmtEtudiant = $pdo->prepare(
        'SELECT e.id, u.nom_complet
         FROM etudiants e
         LEFT JOIN utilisateurs u ON u.id = e.utilisateur_id
         WHERE e.id = :id
         LIMIT 1'
    );
    $stmtEtudiant->execute(['id' => $etudiantId]);
    $etudiant = $stmtEtudiant->fetch();
    if (!$etudiant) {
        envoyerJson(['ok' => false, 'message' => 'Étudiant introuvable.'], 404);
    }

    $stmtQuota = $pdo->prepare('SELECT valeur FROM parametres_application WHERE cle = :cle LIMIT 1');
    $stmtQuota->execute(['cle' => 'quota_max_emprunts_actifs']);
    $paramQuota = $stmtQuota->fetch();
    $quotaMax = $paramQuota ? max(1, (int) $paramQuota['valeur']) : 3;

    $stmtActifs = $pdo->prepare(
        'SELECT COUNT(*) AS total
         FROM emprunts
         WHERE etudiant_id = :etudiant_id
           AND statut IN ("en_cours", "en_retard")
           AND date_retour_effective IS NULL'
    );
    $stmtActifs->execute(['etudiant_id' => $etudiantId]);
    $empruntsActifs = (int) (($stmtActifs->fetch()['total'] ?? 0));

    if ($empruntsActifs >= $quotaMax) {
        envoyerJson([
            'ok' => false,
            'message' => "Quota atteint ({$quotaMax} emprunts actifs maximum).",
        ], 409);
    }

    $stmtRetard = $pdo->prepare(
        'SELECT COUNT(*) AS total
         FROM emprunts
         WHERE etudiant_id = :etudiant_id
           AND statut IN ("en_cours", "en_retard")
           AND date_retour_effective IS NULL
           AND date_retour_prevue < CURDATE()'
    );
    $stmtRetard->execute(['etudiant_id' => $etudiantId]);
    $retardsActifs = (int) (($stmtRetard->fetch()['total'] ?? 0));

    if ($retardsActifs > 0) {
        envoyerJson([
            'ok' => false,
            'message' => 'Emprunt refusé: l\'adhérent a des retards en cours.',
        ], 409);
    }

    $stmtInsert = $pdo->prepare(
        'INSERT INTO emprunts (livre_id, etudiant_id, admin_emetteur_id, date_emprunt, date_retour_prevue, statut)
         VALUES (:livre_id, :etudiant_id, :admin_emetteur_id, :date_emprunt, :date_retour_prevue, :statut)'
    );
    $stmtInsert->execute([
        'livre_id' => $livreId,
        'etudiant_id' => $etudiantId,
        'admin_emetteur_id' => $adminId,
        'date_emprunt' => $dateEmprunt,
        'date_retour_prevue' => $dateRetourPrevue,
        'statut' => 'en_cours',
    ]);

    $empruntId = (int) $pdo->lastInsertId();

    $stmtMajLivre = $pdo->prepare(
        'UPDATE livres
         SET nombre_exemplaires_disponibles = nombre_exemplaires_disponibles - 1,
             statut = CASE WHEN nombre_exemplaires_disponibles - 1 <= 0 THEN "rupture" ELSE "disponible" END
         WHERE id = :id'
    );
    $stmtMajLivre->execute(['id' => $livreId]);

    $stmtNotif = $pdo->prepare(
        'INSERT INTO notifications (utilisateur_id, titre, message, type, est_lue)
         VALUES (NULL, :titre, :message, :type, 0)'
    );
    $stmtNotif->execute([
        'titre' => 'Nouvel emprunt',
        'message' => sprintf(
            'Emprunt validé: %s (%s).',
            (string) $livre['titre'],
            (string) ($etudiant['nom_complet'] ?: ('étudiant #' . $etudiantId))
        ),
        'type' => 'info',
    ]);

    enregistrerJournalAudit('creation_emprunt', 'emprunts', $empruntId, 'Création emprunt', $adminId);

    $pdo->commit();

    envoyerJson([
        'ok' => true,
        'message' => 'Emprunt créé avec succès.',
        'emprunt' => [
            'id' => $empruntId,
            'livre_id' => $livreId,
            'etudiant_id' => $etudiantId,
            'date_emprunt' => $dateEmprunt,
            'date_retour_prevue' => $dateRetourPrevue,
            'titre_livre' => $livre['titre'],
        ],
    ], 201);
} catch (Throwable $e) {
    $pdo->rollBack();
    envoyerJson(['ok' => false, 'message' => 'Impossible de créer l\'emprunt.', 'erreur' => $e->getMessage()], 500);
}
