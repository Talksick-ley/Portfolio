# Medley Mbugua Kimani · Portfolio

Personal portfolio for Medley Mbugua Kimani, Diploma in Industrial Mechatronics (admission number DIM/0433/26).

It is a single static page with no build step and no frameworks. It covers:

- an animated welding scene in the hero section
- an About section with a photo and quick facts
- a skill diagram that explains how the disciplines connect
- a Projects section with completed and planned work
- a Coursework & Evidence section with CATs and Exams marks records, and Practicals projects where applicable
- a Contact section

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Page structure and content |
| `style.css` | All styling and animation |
| `main.js` | Navigation, scroll progress, reveals, project tabs |
| `weld.js` | Welding scene animation |
| `diagram.js` | Interactive skill diagram |
| `coursework.js` | Add-row and add-project controls in Coursework |
| `photo.jpg` | Profile photo used in the About section |

## Editing

- **Contact details:** search `index.html` for `medleydim043326@kiambupoly.ac.ke` (email) and `github.com/Talksick-ley` (GitHub).
- **Photo:** replace `photo.jpg` with a new file of the same name, or change the `src` in the About section.
- **Coursework marks:** type directly into the CATs and Exams tables in the browser. Nothing is saved after the page closes.
- **Projects and media:** in the Practicals subsection, use *Add project*. Add pictures or videos by replacing the *Add evidence* placeholder in `index.html` with an `<img>` or `<video>` element.

## Preview locally

Open `index.html` in any modern browser. No server is needed.

## Hosting on GitHub Pages

1. Go to **Settings → Pages**.
2. Under *Build and deployment*, choose **Deploy from a branch**.
3. Select the `main` branch and the `/ (root)` folder, then save.

The site will be published at `https://talksick-ley.github.io/<repository-name>/`.

## Owner editing (Supabase)

Visitors see published marks and projects. Only the owner can edit, at `/admin`.

1. Create a Supabase project. Run `supabase-setup.sql` once in the SQL Editor.
2. Create a Storage bucket named `portfolio-media` with **Public** turned on.
3. In **Authentication → Sign In / Providers**, turn off new user sign-ups.
4. Create your owner user under **Authentication → Users**, then run `insert into public.owners (user_id) values ('<your-user-id>');`.
5. Copy your project URL and publishable key into `config.js`. Never add a `service_role` key or a database password to this repository.

Anyone can read the public files, so do not put secrets in them. Row Level Security (set up in `supabase-setup.sql`) is what stops visitors from editing.

## License

Released under the MIT License. See [LICENSE](LICENSE).
