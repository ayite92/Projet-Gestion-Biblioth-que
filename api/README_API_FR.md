# API PHP (française)

## Pré-requis
- PHP 8.1+
- MySQL 8+
- Importer `../schema_bibliotheque.sql` dans phpMyAdmin

## Configuration
Modifier `config.php`:
- `BDD_HOTE`
- `BDD_PORT`
- `BDD_NOM`
- `BDD_UTILISATEUR`
- `BDD_MOT_DE_PASSE`

## Endpoints principaux
- `POST /api/inscription.php`
- `POST /api/connexion.php`
- `POST /api/deconnexion.php`
- `GET  /api/session_utilisateur.php`
- `POST /api/verifier_acces_admin.php`
- `POST /api/retour_mode_etudiant.php`
- `GET  /api/livres_lister.php`
- `POST /api/livres_ajouter.php` (admin)
- `POST /api/livres_modifier.php` (admin)
- `GET  /api/etudiants_lister.php`
- `POST /api/etudiants_ajouter.php` (admin)
- `POST /api/emprunts_ajouter.php` (admin)
- `POST /api/reclamations_creer.php`
- `GET  /api/reclamations_lister.php`
- `POST /api/reclamations_repondre.php`
- `POST /api/reclamations_changer_statut.php` (admin)

## Exemple JSON
### Connexion
```json
{
  "email": "email.bibliotheque@esgis.org",
  "mot_de_passe": "#Boy@2026"
}
```

### Vérification administrateur
```json
{
  "identifiant_admin": "boy.biblio",
  "mot_de_passe_admin": "#Boy@2026",
  "code_securite": "BOY-SEC-26"
}
```
