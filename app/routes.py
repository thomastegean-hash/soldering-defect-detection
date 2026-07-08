from fastapi import APIRouter, UploadFile, File
from PIL import Image

from app.detector import detect

router = APIRouter()

@router.post("/detect")
async def detect_image(file: UploadFile = File(...)):
    image = Image.open(file.file).convert("RGB") 
    return detect(image)