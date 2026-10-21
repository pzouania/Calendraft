# Calendraft

**Calendraft** est une application web gratuite qui permet de créer des calendriers personnalisés sur une année complète.

Site : [calendraft.fr](https://calendraft.fr)

## À quoi ça sert ?

Calendraft aide à organiser et visualiser des rythmes qui se répètent tout au long de l'année, par exemple :

- un calendrier de garde alternée pour un enfant
- un planning de travail en 3/8
- des périodes récurrentes (cours, astreintes, activités...)
- tout autre calendrier personnalisé

Vous créez vos périodes, choisissez leur répétition, et Calendraft génère automatiquement un calendrier annuel clair et imprimable.

## Fonctionnalités

- **Compte utilisateur** : inscription, connexion et réinitialisation du mot de passe
- **Tableau de bord** : retrouvez, recherchez, ouvrez et supprimez vos calendriers
- **Éditeur de périodes** : nom, durée, date de départ, fréquence et répétition
- **Vue annuelle** : les 12 mois sur une page, avec des bandes de couleur et une légende
- **Vue journalière** : les heures affichées en colonne
- **Partage** : par lien ou par email, en lecture seule ou en édition
- **Import iCalendar** : ajoutez un emploi du temps via un lien `.ics`, mis à jour automatiquement
- **Rappels** : notifications push réglables pour chaque événement
- **Export PDF** fidèle à l'affichage à l'écran
- **Personnalisation** : thèmes de couleur, mode sombre, français / anglais / allemand
- **Mobile** : application installable (PWA) et APK Android

## Technologies

- [Supabase](https://supabase.com) : authentification et base de données
- [Cloudflare Workers](https://workers.cloudflare.com) : hébergement

Le projet repose uniquement sur des services gratuits.

## Confidentialité

Chaque calendrier n'est accessible qu'à son propriétaire et aux personnes avec qui il a été explicitement partagé.
