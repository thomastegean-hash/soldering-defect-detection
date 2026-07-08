from app.models import (
    classifier,
    perspective_model,
    top_model,
)

def detect(image):
    # classify image
    cls_result = classifier(image)[0]
    view = cls_result.names[int(cls_result.probs.top1)]

    detector = (
        perspective_model
        if view == "perspective"
        else top_model
    )

    result = detector(image)[0]

    detections = []

    for box in result.boxes:
        cls = int(box.cls)

        detections.append({
            "class": result.names[cls],
            "confidence": float(box.conf),
            "bbox": box.xyxy[0].tolist()
        })

    return {
        "view": view,
        "detections": detections
    }
