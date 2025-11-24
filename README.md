# Temple Prep Class - Provo 189th Ward

Website for the Temple Preparation Class taught by Jared Achee and Kayley Bikman.

## GitHub Pages Deployment

This site is configured for GitHub Pages. To deploy:

1. Push all files to your GitHub repository
2. Go to Settings > Pages in your repository
3. Select the branch (usually `main` or `master`)
4. Select the root folder (`/`)
5. Save

The site will be available at `https://[username].github.io/[repository-name]/`

## File Structure

- `index.html` - Homepage
- `lessons.html` - Class slides page
- `books.html` - Recommended books page
- `contact.html` - Contact information page
- `images/` - Background images and assets

## Local Development

If you want to test locally, you can use a simple HTTP server:

```bash
# Python 3
python -m http.server 8000

# Node.js (if you have http-server installed)
npx http-server
```

Then visit `http://localhost:8000`
