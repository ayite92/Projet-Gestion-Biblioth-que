<?php
declare(strict_types=1);

require_once __DIR__ . '/utilitaires.php';

exigerMethode('POST');
$utilisateur = exigerConnexion();
exigerAccesAdministrateur();
$donnees = lireCorpsJson();

$nomComplet = trim((string) ($donnees['nom_complet'] ?? ''));
$matricule = strtoupper(trim((string) ($donnees['matricule'] ?? '')));
$email = mb_strtolower(trim((string) ($donnees['email'] ?? '')));
$motDePasse = (string) ($donnees['mot_de_passe'] ?? '');
$filiere = trim((string) ($donnees['filiere'] ?? ''));
$niveau = trim((string) ($donnees['niveau'] ?? ''));
$typeAdherent = trim((string) ($donnees['type_adherent'] ?? 'etudiant'));
$typeAdherent = in_array($typeAdherent, ['etudiant', 'enseignant'], true) ? $typeAdherent : 'etudiant';

if ($nomComplet === '' || $matricule === '' || $email === '' || $motDePasse === '' || $filiere === '' || $niveau === '') {
    envoyerJson(['ok' => false, 'message' => 'Tous les champs étudiant sont requis.'], 422);
}

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    envoyerJson(['ok' => false, 'message' => 'Email étudiant invalide.'], 422);
}

$pdo = obtenirConnexionBdd();
$roleNom = $typeAdherent === 'enseignant' ? 'enseignant' : 'etudiant';
$roleId = idRoleParNom($pdo, $roleNom);
if (!$roleId && $roleNom === 'enseignant') {
    $stmtRole = $pdo->prepare('INSERT INTO roles(nom) VALUES (:nom)');
    try {
        $stmtRole->execute(['nom' => 'enseignant']);
    } catch (Throwable $e) {
        // rôle créé entre-temps
    }
    $roleId = idRoleParNom($pdo, $roleNom);
}
if (!$roleId) {
    envoyerJson(['ok' => false, 'message' => 'Rôle adhérent introuvable.'], 500);
}

$hash = password_hash($motDePasse, PASSWORD_DEFAULT);
$adminId = (int) ($_SESSION['admin_utilisateur_id'] ?? $utilisateur['id']);

$pdo->beginTransaction();
try {
    $stmtMatricule = $pdo->prepare('SELECT id FROM etudiants WHERE matricule = :matricule LIMIT 1');
    $stmtMatricule->execute(['matricule' => $matricule]);
    $existantMatricule = $stmtMatricule->fetch();
    if ($existantMatricule) {
        envoyerJson(['ok' => false, 'message' => 'Ce matricule existe déjà.'], 409);
    }

    $stmtUtilisateur = $pdo->prepare('SELECT id FROM utilisateurs WHERE email = :email LIMIT 1');
    $stmtUtilisateur->execute(['email' => $email]);
    $existantUtilisateur = $stmtUtilisateur->fetch();

    if ($existantUtilisateur) {
        $utilisateurId = (int) $existantUtilisateur['id'];
        $stmtMajUser = $pdo->prepare(
            'UPDATE utilisateurs
             SET nom_complet = :nom_complet, mot_de_passe_hash = :mot_de_passe_hash, role_id = :role_id, est_actif = 1
             WHERE id = :id'
        );
        $stmtMajUser->execute([
            'nom_complet' => $nomComplet,
            'mot_de_passe_hash' => $hash,
            'role_id' => $roleId,
            'id' => $utilisateurId,
        ]);
    } else {
        $stmtInsertUser = $pdo->prepare(
            'INSERT INTO utilisateurs (nom_complet, email, mot_de_passe_hash, role_id)
             VALUES (:nom_complet, :email, :mot_de_passe_hash, :role_id)'
        );
        $stmtInsertUser->execute([
            'nom_complet' => $nomComplet,
            'email' => $email,
            'mot_de_passe_hash' => $hash,
            'role_id' => $roleId,
        ]);
        $utilisateurId = (int) $pdo->lastInsertId();
    }

    $stmtInsertEtudiant = $pdo->prepare(
        'INSERT INTO etudiants (utilisateur_id, matricule, filiere, niveau, date_inscription, statut)
         VALUES (:utilisateur_id, :matricule, :filiere, :niveau, CURDATE(), :statut)'
    );
    $stmtInsertEtudiant->execute([
        'utilisateur_id' => $utilisateurId,
        'matricule' => $matricule,
        'filiere' => $filiere,
        'niveau' => $niveau,
        'statut' => 'actif',
    ]);

    $etudiantId = (int) $pdo->lastInsertId();

    enregistrerJournalAudit('ajout_etudiant', 'etudiants', $etudiantId, 'Ajout étudiant par administrateur', $adminId);

    $pdo->commit();

    envoyerJson([
        'ok' => true,
        'message' => 'Étudiant ajouté avec succès.',
        'etudiant' => [
            'id' => $etudiantId,
            'utilisateur_id' => $utilisateurId,
            'nom_complet' => $nomComplet,
            'email' => $email,
            'matricule' => $matricule,
            'filiere' => $filiere,
            'niveau' => $niveau,
            'nb_emprunts_actifs' => 0,
            'type_adherent' => $typeAdherent,
        ],
    ], 201);
} catch (Throwable $e) {
    $pdo->rollBack();
    envoyerJson(['ok' => false, 'message' => 'Impossible d\'ajouter l\'étudiant.', 'erreur' => $e->getMessage()], 500);
}
