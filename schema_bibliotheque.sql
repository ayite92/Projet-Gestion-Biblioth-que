SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

CREATE DATABASE IF NOT EXISTS bibliotheque_fr
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
USE bibliotheque_fr;

-- Nettoyage pour re-import
DROP TABLE IF EXISTS journal_audit;
DROP TABLE IF EXISTS parametres_application;
DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS messages_reclamation;
DROP TABLE IF EXISTS reclamations;
DROP TABLE IF EXISTS journal_modifications_livres;
DROP TABLE IF EXISTS emprunts;
DROP TABLE IF EXISTS livres;
DROP TABLE IF EXISTS categories_livres;
DROP TABLE IF EXISTS etudiants;
DROP TABLE IF EXISTS profils_administrateurs;
DROP TABLE IF EXISTS utilisateurs;
DROP TABLE IF EXISTS roles;

-- Roles
CREATE TABLE roles (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nom VARCHAR(30) NOT NULL UNIQUE,
  cree_le TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Utilisateurs (authentification)
CREATE TABLE utilisateurs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nom_complet VARCHAR(120) NOT NULL,
  email VARCHAR(190) NOT NULL UNIQUE,
  mot_de_passe_hash VARCHAR(255) NOT NULL,
  role_id BIGINT UNSIGNED NOT NULL,
  est_actif TINYINT(1) NOT NULL DEFAULT 1,
  derniere_connexion_le DATETIME NULL,
  cree_le TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modifie_le TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_utilisateurs_role FOREIGN KEY (role_id) REFERENCES roles(id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT
) ENGINE=InnoDB;

-- Profil administrateur (verification renforcee)
CREATE TABLE profils_administrateurs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  utilisateur_id BIGINT UNSIGNED NOT NULL UNIQUE,
  identifiant_admin VARCHAR(80) NOT NULL UNIQUE,
  code_securite_hash VARCHAR(255) NOT NULL,
  cree_le TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modifie_le TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_profils_admin_utilisateur FOREIGN KEY (utilisateur_id) REFERENCES utilisateurs(id)
    ON UPDATE CASCADE
    ON DELETE CASCADE
) ENGINE=InnoDB;

-- Etudiants
CREATE TABLE etudiants (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  utilisateur_id BIGINT UNSIGNED NULL UNIQUE,
  matricule VARCHAR(40) NOT NULL UNIQUE,
  filiere VARCHAR(120) NOT NULL,
  niveau VARCHAR(50) NOT NULL,
  date_inscription DATE NOT NULL,
  statut ENUM('actif','suspendu','diplome') NOT NULL DEFAULT 'actif',
  cree_le TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modifie_le TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_etudiants_utilisateur FOREIGN KEY (utilisateur_id) REFERENCES utilisateurs(id)
    ON UPDATE CASCADE
    ON DELETE SET NULL
) ENGINE=InnoDB;

-- Categories de livres
CREATE TABLE categories_livres (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nom VARCHAR(100) NOT NULL UNIQUE,
  description VARCHAR(255) NULL,
  cree_le TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Livres
CREATE TABLE livres (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  isbn VARCHAR(20) NOT NULL UNIQUE,
  titre VARCHAR(255) NOT NULL,
  auteur VARCHAR(180) NOT NULL,
  editeur VARCHAR(140) NULL,
  annee_publication SMALLINT UNSIGNED NULL,
  categorie_id BIGINT UNSIGNED NULL,
  nombre_total_exemplaires INT UNSIGNED NOT NULL DEFAULT 1,
  nombre_exemplaires_disponibles INT UNSIGNED NOT NULL DEFAULT 1,
  code_emplacement VARCHAR(40) NULL,
  statut ENUM('disponible','rupture','archive') NOT NULL DEFAULT 'disponible',
  cree_le TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modifie_le TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_livres_categorie FOREIGN KEY (categorie_id) REFERENCES categories_livres(id)
    ON UPDATE CASCADE
    ON DELETE SET NULL,
  CONSTRAINT chk_livres_stock CHECK (nombre_exemplaires_disponibles <= nombre_total_exemplaires)
) ENGINE=InnoDB;

-- Emprunts
CREATE TABLE emprunts (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  livre_id BIGINT UNSIGNED NOT NULL,
  etudiant_id BIGINT UNSIGNED NOT NULL,
  admin_emetteur_id BIGINT UNSIGNED NULL,
  date_emprunt DATE NOT NULL,
  date_retour_prevue DATE NOT NULL,
  date_retour_effective DATE NULL,
  statut ENUM('en_cours','retourne','en_retard','perdu') NOT NULL DEFAULT 'en_cours',
  montant_penalite DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  remarque VARCHAR(255) NULL,
  cree_le TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modifie_le TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_emprunts_livre FOREIGN KEY (livre_id) REFERENCES livres(id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT fk_emprunts_etudiant FOREIGN KEY (etudiant_id) REFERENCES etudiants(id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT fk_emprunts_admin FOREIGN KEY (admin_emetteur_id) REFERENCES utilisateurs(id)
    ON UPDATE CASCADE
    ON DELETE SET NULL,
  CONSTRAINT chk_emprunts_dates CHECK (date_retour_prevue >= date_emprunt)
) ENGINE=InnoDB;

-- Journal des modifications sur les livres
CREATE TABLE journal_modifications_livres (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  livre_id BIGINT UNSIGNED NOT NULL,
  admin_id BIGINT UNSIGNED NULL,
  type_modification ENUM('creation','mise_a_jour','suppression','ajustement_stock') NOT NULL,
  anciennes_valeurs JSON NULL,
  nouvelles_valeurs JSON NULL,
  note VARCHAR(255) NULL,
  cree_le TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_journal_livres_livre FOREIGN KEY (livre_id) REFERENCES livres(id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  CONSTRAINT fk_journal_livres_admin FOREIGN KEY (admin_id) REFERENCES utilisateurs(id)
    ON UPDATE CASCADE
    ON DELETE SET NULL
) ENGINE=InnoDB;

-- Reclamations etudiantes
CREATE TABLE reclamations (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  etudiant_id BIGINT UNSIGNED NOT NULL,
  admin_assigne_id BIGINT UNSIGNED NULL,
  objet VARCHAR(160) NOT NULL,
  description TEXT NOT NULL,
  categorie ENUM('probleme_emprunt','livre_endommage','contestation_penalite','probleme_compte','autre') NOT NULL DEFAULT 'autre',
  priorite ENUM('basse','moyenne','haute','urgente') NOT NULL DEFAULT 'moyenne',
  statut ENUM('ouverte','en_traitement','resolue','rejetee') NOT NULL DEFAULT 'ouverte',
  cree_le TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modifie_le TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  resolue_le DATETIME NULL,
  CONSTRAINT fk_reclamations_etudiant FOREIGN KEY (etudiant_id) REFERENCES etudiants(id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT fk_reclamations_admin FOREIGN KEY (admin_assigne_id) REFERENCES utilisateurs(id)
    ON UPDATE CASCADE
    ON DELETE SET NULL
) ENGINE=InnoDB;

-- Messages sur les reclamations
CREATE TABLE messages_reclamation (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  reclamation_id BIGINT UNSIGNED NOT NULL,
  expediteur_utilisateur_id BIGINT UNSIGNED NOT NULL,
  message TEXT NOT NULL,
  cree_le TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_messages_reclamation FOREIGN KEY (reclamation_id) REFERENCES reclamations(id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  CONSTRAINT fk_messages_expediteur FOREIGN KEY (expediteur_utilisateur_id) REFERENCES utilisateurs(id)
    ON UPDATE CASCADE
    ON DELETE CASCADE
) ENGINE=InnoDB;

-- Notifications
CREATE TABLE notifications (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  utilisateur_id BIGINT UNSIGNED NULL,
  titre VARCHAR(140) NOT NULL,
  message TEXT NOT NULL,
  type ENUM('info','succes','alerte','danger') NOT NULL DEFAULT 'info',
  est_lue TINYINT(1) NOT NULL DEFAULT 0,
  cree_le TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lue_le DATETIME NULL,
  CONSTRAINT fk_notifications_utilisateur FOREIGN KEY (utilisateur_id) REFERENCES utilisateurs(id)
    ON UPDATE CASCADE
    ON DELETE CASCADE
) ENGINE=InnoDB;

-- Parametres application
CREATE TABLE parametres_application (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  cle VARCHAR(120) NOT NULL UNIQUE,
  valeur TEXT NOT NULL,
  modifie_par BIGINT UNSIGNED NULL,
  modifie_le TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_parametres_utilisateur FOREIGN KEY (modifie_par) REFERENCES utilisateurs(id)
    ON UPDATE CASCADE
    ON DELETE SET NULL
) ENGINE=InnoDB;

-- Journal d'audit
CREATE TABLE journal_audit (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  utilisateur_id BIGINT UNSIGNED NULL,
  action VARCHAR(120) NOT NULL,
  entite VARCHAR(80) NOT NULL,
  entite_id BIGINT UNSIGNED NULL,
  description TEXT NULL,
  adresse_ip VARCHAR(45) NULL,
  cree_le TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_journal_audit_utilisateur FOREIGN KEY (utilisateur_id) REFERENCES utilisateurs(id)
    ON UPDATE CASCADE
    ON DELETE SET NULL
) ENGINE=InnoDB;

-- Index
CREATE INDEX idx_utilisateurs_role ON utilisateurs(role_id);
CREATE INDEX idx_etudiants_filiere ON etudiants(filiere);
CREATE INDEX idx_livres_titre ON livres(titre);
CREATE INDEX idx_livres_auteur ON livres(auteur);
CREATE INDEX idx_emprunts_etudiant_statut ON emprunts(etudiant_id, statut);
CREATE INDEX idx_emprunts_date_retour_prevue ON emprunts(date_retour_prevue);
CREATE INDEX idx_journal_livres_livre_date ON journal_modifications_livres(livre_id, cree_le);
CREATE INDEX idx_reclamations_etudiant_statut ON reclamations(etudiant_id, statut);
CREATE INDEX idx_reclamations_admin_statut ON reclamations(admin_assigne_id, statut);
CREATE INDEX idx_notifications_utilisateur_lue ON notifications(utilisateur_id, est_lue);
CREATE INDEX idx_journal_audit_action_date ON journal_audit(action, cree_le);

-- Donnees initiales
INSERT INTO roles(nom) VALUES ('administrateur'), ('etudiant');

INSERT INTO categories_livres(nom) VALUES
('Informatique'), ('Mathematiques'), ('Physique'), ('Chimie'), ('Litterature');

-- Hashs temporaires de demonstration (a remplacer cote backend)
INSERT INTO utilisateurs(nom_complet, email, mot_de_passe_hash, role_id)
SELECT 'Admin Biblio', 'email.bibliotheque@esgis.org', '$2y$10$DZXBUaHLXvjIY3HAouwtVuQDhw6GCCIiTRirtQJDO.nhKXLyKDMge', r.id
FROM roles r WHERE r.nom = 'administrateur';

INSERT INTO profils_administrateurs(utilisateur_id, identifiant_admin, code_securite_hash)
SELECT u.id, 'boy.biblio', '$2y$10$2S.vv4wsp8WLQ57ctH85.ehkb0eCSh.LWrfiY9bV5140UefK69Ny.'
FROM utilisateurs u WHERE u.email = 'email.bibliotheque@esgis.org';

INSERT INTO parametres_application(cle, valeur) VALUES
('duree_max_emprunt_jours', '30'),
('montant_penalite_journalier', '1.00'),
('quota_max_emprunts_actifs', '3');

SET FOREIGN_KEY_CHECKS = 1;
