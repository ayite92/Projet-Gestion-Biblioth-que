<?php
declare(strict_types=1);

require_once __DIR__ . '/utilitaires.php';

exigerMethode('POST');
$utilisateur = exigerConnexion();
exigerAccesAdministrateur();
$donnees = lireCorpsJson();

$empruntId = (int) ($donnees['emprunt_id'] ?? 0);
$forcerPenalite = (bool) ($donnees['forcer_penalite'] ?? false);

if ($empruntId <= 0) {
    envoyerJson(['ok' => false, 'message' => 'emprunt_id invalide.'], 422);
}

$pdo = obtenirConnexionBdd();
$adminId = (int) ($_SESSION['admin_utilisateur_id'] ?? $utilisateur['id']);

$pdo->beginTransaction();
try {
    $stmt = $pdo->prepare('SELECT * FROM emprunts WHERE id = :id LIMIT 1');
    $stmt->execute(['id' => $empruntId]);
    $emprunt = $stmt->fetch();

    if (!$emprunt) {
        envoyerJson(['ok' => false, 'message' => 'Emprunt introuvable.'], 404);
    }

    if ((string) $emprunt['statut'] === 'retourne') {
        envoyerJson(['ok' => false, 'message' => 'Cet emprunt est déjà retourné.'], 409);
    }

    $stmtPenalite = $pdo->prepare('SELECT valeur FROM parametres_application WHERE cle = :cle LIMIT 1');
    $stmtPenalite->execute(['cle' => 'montant_penalite_journalier']);
    $paramPenalite = $stmtPenalite->fetch();
    $penaliteJour = $paramPenalite ? (float) $paramPenalite['valeur'] : 1.0;

    $retourPrevu = new DateTimeImmutable((string) $emprunt['date_retour_prevue']);
    $retourEffectif = new DateTimeImmutable('today');

    $joursRetard = (int) $retourPrevu->diff($retourEffectif)->format('%r%a');
    $joursRetard = max(0, $joursRetard);

    $montantPenalite = $joursRetard > 0 ? $joursRetard * $penaliteJour : 0.0;
    if ($forcerPenalite && $montantPenalite <= 0) {
        $montantPenalite = $penaliteJour;
    }

    $stmtMaj = $pdo->prepare(
        'UPDATE emprunts
         SET date_retour_effective = CURDATE(),
             statut = :statut,
             montant_penalite = :montant_penalite
         WHERE id = :id'
    );
    $stmtMaj->execute([
        'statut' => 'retourne',
        'montant_penalite' => $montantPenalite,
        'id' => $empruntId,
    ]);

    $stmtLivre = $pdo->prepare(
        'UPDATE livres
         SET nombre_exemplaires_disponibles = nombre_exemplaires_disponibles + 1,
             statut = "disponible"
         WHERE id = :id'
    );
    $stmtLivre->execute(['id' => (int) $emprunt['livre_id']]);

    enregistrerJournalAudit('retour_emprunt', 'emprunts', $empruntId, 'Retour d\'emprunt enregistré', $adminId);

    $pdo->commit();

    envoyerJson([
        'ok' => true,
        'message' => 'Retour enregistré.',
        'resultat' => [
            'emprunt_id' => $empruntId,
            'jours_retard' => $joursRetard,
            'montant_penalite' => $montantPenalite,
        ],
    ]);
} catch (Throwable $e) {
    $pdo->rollBack();
    envoyerJson(['ok' => false, 'message' => 'Impossible d\'enregistrer le retour.', 'erreur' => $e->getMessage()], 500);
}
