from ultralytics import YOLO

classifier = YOLO("models/deploy/view_classifier.pt")
perspective_model = YOLO("models/deploy/perspective.pt")
top_model = YOLO("models/deploy/top_view.pt")
