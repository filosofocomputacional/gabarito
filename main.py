from fastapi import FastAPI, UploadFile, File, Form
from fastapi.responses import HTMLResponse
from fastapi.middleware.cors import CORSMiddleware
import cv2
import numpy as np
import base64

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

LETRAS = ["A", "B", "C", "D", "E"]

def ordenar_pontos(pts):
    pts = np.array(pts, dtype="float32")
    rect = np.zeros((4, 2), dtype="float32")
    s = pts.sum(axis=1)
    rect[0] = pts[np.argmin(s)]
    rect[3] = pts[np.argmax(s)]
    diff = np.diff(pts, axis=1)
    rect[1] = pts[np.argmin(diff)]
    rect[2] = pts[np.argmax(diff)]
    return rect

# Rota que entrega a página HTML
@app.get("/", response_class=HTMLResponse)
async def home():
    with open("index.html", "r", encoding="utf-8") as f:
        return f.read()

@app.post("/corrigir")
async def corrigir_gabarito(
    file: UploadFile = File(...),
    gabarito: str = Form("BDCBCDCBAB"),
    x1: int = Form(100), y1: int = Form(104),
    x2: int = Form(356), y2: int = Form(105),
    spX: int = Form(33), spY: int = Form(51)
):
    contents = await file.read()
    nparr = np.frombuffer(contents, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    blur = cv2.GaussianBlur(gray, (5, 5), 0)
    thresh = cv2.adaptiveThreshold(blur, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 51, 11)

    contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    anchors = []
    for cnt in contours:
        peri = cv2.arcLength(cnt, True)
        approx = cv2.approxPolyDP(cnt, 0.04 * peri, True)
        if len(approx) == 4:
            x, y, w, h = cv2.boundingRect(approx)
            if 300 < (w * h) < 50000 and 0.7 < (w / float(h)) < 1.3:
                M = cv2.moments(cnt)
                if M["m00"] != 0:
                    anchors.append([int(M["m10"] / M["m00"]), int(M["m01"] / M["m00"])])

    if len(anchors) != 4:
        return {"sucesso": False, "mensagem": "⚠️ Os 4 cantos do gabarito não foram identificados."}

    pts_origem = ordenar_pontos(anchors)
    dW, dH = 600, 450
    pts_destino = np.float32([[0, 0], [dW, 0], [0, dH], [dW, dH]])
    M_trans = cv2.getPerspectiveTransform(pts_origem, pts_destino)

    warped = cv2.warpPerspective(img, M_trans, (dW, dH))
    warped_gray = cv2.cvtColor(warped, cv2.COLOR_BGR2GRAY)
    _, warped_thresh = cv2.threshold(
        cv2.GaussianBlur(warped_gray, (3, 3), 0), 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU
    )

    acertos = 0
    respostas_aluno = []

    for q in range(10):
        is_col2 = q >= 5
        col_base_x = x2 if is_col2 else x1
        col_base_y = y2 if is_col2 else y1
        linha_idx = (q - 5) if is_col2 else q
        y_ponto = col_base_y + (linha_idx * spY)

        valores_alternativas = []
        coords = []

        for i in range(5):
            x_ponto = col_base_x + (i * spX)
            coords.append((x_ponto, y_ponto))
            if 12 <= y_ponto < dH - 12 and 12 <= x_ponto < dW - 12:
                roi = warped_thresh[y_ponto-12:y_ponto+12, x_ponto-12:x_ponto+12]
                total_pixels = cv2.countNonZero(roi)
            else:
                total_pixels = 0
            valores_alternativas.append(total_pixels)

        idx_marcado = np.argmax(valores_alternativas)
        max_pixels = valores_alternativas[idx_marcado]
        outras_alts = [v for idx, v in enumerate(valores_alternativas) if idx != idx_marcado]
        media_outras = np.mean(outras_alts) if outras_alts else 0

        if max_pixels > 120 and max_pixels > (media_outras * 1.8):
            resposta_aluno = LETRAS[idx_marcado]
        else:
            resposta_aluno = "-"
        
        respostas_aluno.append(resposta_aluno)

        cor_acerto = (0, 255, 0) if q < len(gabarito) and resposta_aluno == gabarito[q] else (0, 0, 255)
        for i, (cx, cy) in enumerate(coords):
            r_color = cor_acerto if i == idx_marcado and resposta_aluno != "-" else (200, 200, 200)
            cv2.circle(warped, (cx, cy), 4, r_color, -1)

        if q < len(gabarito) and resposta_aluno == gabarito[q]:
            acertos += 1

    nota = (acertos / 10.0) * 10.0

    _, buffer = cv2.imencode('.jpg', warped)
    warped_b64 = base64.b64encode(buffer).decode('utf-8')

    return {
        "sucesso": True,
        "nota": nota,
        "acertos": acertos,
        "respostas": "".join(respostas_aluno),
        "imagem_warped": f"data:image/jpeg;base64,{warped_b64}"
    }