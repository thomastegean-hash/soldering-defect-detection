from fastapi import FastAPI, Depends, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from app.routes import router
from app.auth import router as auth_router, get_current_operator, limiter

app = FastAPI()

# Wire the rate limiter into the app — without these two lines the
# @limiter.limit() decorator on /api/auth/login does nothing.
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Auth router first so /login and /api/auth/* are registered before the
# catch-all static mount, and before any protected routes.
app.include_router(auth_router)
app.include_router(router)

app.mount("/static", StaticFiles(directory="static"), name="static")


@app.get("/")
async def home(operator=Depends(get_current_operator)):
    return FileResponse("static/index.html")

