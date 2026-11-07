# Personal Portfolio · Proprietary Project

This repository contains a privately owned personal portfolio website developed for individual use.

The website, its source code, original design, visual identity, animations, layouts, graphics, written content and custom implementations are protected intellectual property.

## Ownership & Copyright

**© 2026. All Rights Reserved.**

This project is private intellectual property. No part of this website may be copied, reproduced, republished, redistributed, modified, adapted, incorporated into another project, or used commercially without prior written permission from the copyright owner.

This restriction applies to the website's:

- Original visual design and interface layouts.
- Custom animations and interactive elements.
- Source code and original implementations.
- Graphics, illustrations and visual assets.
- Written content and documentation.
- Overall presentation and distinctive design elements.

Viewing this repository or accessing the published website does not grant permission to reuse, reproduce or claim ownership of its contents.

Any permitted use must be expressly authorised by the copyright owner in writing.

## Project Overview

The portfolio is a static website built without a frontend framework or build process.

Its features include:

- An animated welding scene in the hero section.
- An About section.
- An interactive skills diagram.
- A Projects section featuring completed and planned work.
- A Coursework & Evidence section with assessment records and practical project documentation.
- A Contact section.

## Project Structure

| File | Purpose |
| --- | --- |
| `index.html` | Main page structure and content |
| `style.css` | Styling, visual effects and animations |
| `main.js` | Navigation, scroll progress, reveals and project tabs |
| `weld.js` | Welding scene animation |
| `diagram.js` | Interactive skills diagram |
| `coursework.js` | Coursework records and project controls |
| `admin.html` | Private administration interface |
| `admin.js` | Authentication, marks, projects and media management |
| `config.js` | Public Supabase configuration |
| `photo.jpg` | Profile image |

Additional database and configuration files support the backend and media storage.

## Technical Information

### Frontend
- HTML, CSS and JavaScript.
- No framework or build step.
- Designed as a static website.

### Backend
- Supabase Authentication.
- Supabase database.
- Supabase Storage.
- Row Level Security for owner-controlled editing.

### Media Management
The portfolio supports project evidence in the form of:
- Images.
- Videos.
- PDF documents.

Public visitors can view published content. Administrative operations are restricted to the authorised owner.

## Maintenance

The project can be maintained by editing the relevant source files.

- **Content and structure:** `index.html`
- **Visual styling:** `style.css`
- **Navigation and interactions:** `main.js`
- **Welding animation:** `weld.js`
- **Skills diagram:** `diagram.js`
- **Coursework functionality:** `coursework.js`
- **Administrative functionality:** `admin.js`
- **Supabase configuration:** `config.js`

Changes to the database structure should be made through carefully reviewed SQL migrations.

## Deployment

The website can be hosted using GitHub Pages.

To configure deployment:

1. Open repository Settings.
2. Navigate to Pages.
3. Select Deploy from a branch.
4. Choose the appropriate branch and root directory.
5. Save the configuration.

## Security Notice

The frontend contains public configuration only. Sensitive credentials, service-role keys and database passwords must never be committed to the repository.

Database access and administrative permissions must remain protected through Supabase Authentication and Row Level Security.

---

**NOTICE OF PROPRIETARY OWNERSHIP**

This is an independently developed personal portfolio and original creative work.

All rights are reserved by its copyright owner. No permission to copy, reproduce, redistribute, modify, adapt, or commercially exploit this work is granted through its publication or availability.

**Unauthorised use is prohibited.**
