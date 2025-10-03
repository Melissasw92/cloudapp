# CloudApp

## Local dev
- Backend: `cd backend && npm install && node app.js` (http://localhost:5000)
- Frontend: `cd frontend && npm install && npm run dev` (http://localhost:5173)

## Docker local
- Build backend: `docker build -t tasks-api:dev ./backend`
- Run backend: `docker run --rm -p 5000:5000 tasks-api:dev`
- Build frontend: `docker build -t tasks-web:dev --build-arg VITE_API_URL=http://localhost:5000 ./frontend`
- Run frontend: `docker run --rm -p 3000:80 tasks-web:dev`

## CI
GitHub Actions: `.github/workflows/ci.yml` builds backend & frontend on push.
