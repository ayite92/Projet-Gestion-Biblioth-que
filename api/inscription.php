<?php
declare(strict_types=1);

require_once __DIR__ . '/utilitaires.php';

exigerMethode('POST');
$donnees = lireCorpsJson();

$nomComplet = trim((string) ($donnees['nom_complet'] ?? ''));
$email = mb_strtolower(trim((string) ($donnees['email'] ?? '')));
$motDePasse = (string) ($donnees['mot_de_passe'] ?? '');
$typeAdherent = trim((string) ($donnees['type_adherent'] ?? 'etudiant'));
$typeAdherent = in_array($typeAdherent, ['etudiant', 'enseignant'], true) ? $typeAdherent : 'etudiant';

if ($email === '' || $motDePasse === '') {
    envoyerJson(['ok' => false, 'message' => 'Email et mot de passe requis.'], 422);
}

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    envoyerJson(['ok' => false, 'message' => 'Format email invalide.'], 422);
}

if ($nomComplet === '') {
    $nomComplet = strstr($email, '@', true) ?: ($typeAdherent === 'enseignant' ? 'Enseignant' : 'Étudiant');
}

$pdo = obtenirConnexionBdd();
$roleNom = $typeAdherent === 'enseignant' ? 'enseignant' : 'etudiant';
$roleId = idRoleParNom($pdo, $roleNom);
if (!$roleId && $roleNom === 'enseignant') {
    $stmtRole = $pdo->prepare('INSERT INTO roles(nom) VALUES (:nom)');
    try {
        $stmtRole->execute(['nom' => 'enseignant']);
    } catch (Throwable $e) {
        // rôle déjà créé par une autre requête
    }
    $roleId = idRoleParNom($pdo, $roleNom);
}
if (!$roleId) {
    envoyerJson(['ok' => false, 'message' => 'Rôle adhérent introuvable dans la base.'], 500);
}

$hash = password_hash($motDePasse, PASSWORD_DEFAULT);

$pdo->beginTransaction();
try {
    $stmtExistant = $pdo->prepare('SELECT id FROM utilisateurs WHERE email = :email LIMIT 1');
    $stmtExistant->execute(['email' => $email]);
    $existant = $stmtExistant->fetch();

    if ($existant) {
        $stmtMaj = $pdo->prepare(
            'UPDATE utilisateurs
             SET nom_complet = :nom_complet, mot_de_passe_hash = :mot_de_passe_hash, role_id = :role_id, est_actif = 1
             WHERE id = :id'
        );
        $stmtMaj->execute([
            'nom_complet' => $nomComplet,
            'mot_de_passe_hash' => $hash,
            'role_id' => $roleId,
            'id' => (int) $existant['id'],
        ]);
        $utilisateurId = (int) $existant['id'];
    } else {
        $stmtInsertion = $pdo->prepare(
            'INSERT INTO utilisateurs (nom_complet, email, mot_de_passe_hash, role_id)
             VALUES (:nom_complet, :email, :mot_de_passe_hash, :role_id)'
        );
        $stmtInsertion->execute([
            'nom_complet' => $nomComplet,
            'email' => $email,
            'mot_de_passe_hash' => $hash,
            'role_id' => $roleId,
        ]);
        $utilisateurId = (int) $pdo->lastInsertId();
    }

    $stmtProfilEtudiant = $pdo->prepare('SELECT id FROM etudiants WHERE utilisateur_id = :utilisateur_id LIMIT 1');
    $stmtProfilEtudiant->execute(['utilisateur_id' => $utilisateurId]);
    $profilEtudiant = $stmtProfilEtudiant->fetch();

    if (!$profilEtudiant) {
        $prefixe = $typeAdherent === 'enseignant' ? 'ENS' : 'ETU';
        $matricule = sprintf('%s-%s-%06d', $prefixe, date('Y'), $utilisateurId);
        $filiereParDefaut = $typeAdherent === 'enseignant' ? 'Enseignement' : 'Non renseignee';
        $niveauParDefaut = $typeAdherent === 'enseignant' ? 'ENSEIGNANT' : 'N/A';
        $stmtInsertEtudiant = $pdo->prepare(
            'INSERT INTO etudiants (utilisateur_id, matricule, filiere, niveau, date_inscription, statut)
             VALUES (:utilisateur_id, :matricule, :filiere, :niveau, :date_inscription, :statut)'
        );
        $stmtInsertEtudiant->execute([
            'utilisateur_id' => $utilisateurId,
            'matricule' => $matricule,
            'filiere' => $filiereParDefaut,
            'niveau' => $niveauParDefaut,
            'date_inscription' => date('Y-m-d'),
            'statut' => 'actif',
        ]);
    }

    $pdo->commit();

    enregistrerJournalAudit('inscription', 'utilisateurs', $utilisateurId, 'Inscription ou mise à jour compte étudiant', $utilisateurId);

    envoyerJson([
        'ok' => true,
        'message' => 'Inscription adhérent réussie.',
        'utilisateur' => [
            'id' => $utilisateurId,
            'nom_complet' => $nomComplet,
            'email' => $email,
            'role' => $roleNom,
        ],
    ]);
} catch (Throwable $e) {
    $pdo->rollBack();
    envoyerJson(['ok' => false, 'message' => 'Erreur lors de l\'inscription.', 'erreur' => $e->getMessage()], 500);
}
