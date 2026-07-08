from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from app.routes import router

app = FastAPI()

app.include_router(router)

app.include_router(router)

app.mount("/static", StaticFiles(directory="static"), name="static")


@app.get("/")
async def home():
    return FileResponse("static/index.html")
