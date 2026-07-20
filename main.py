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
    rect[0] = pts[np.argmin(s)]      # Top-Left
    rect[3] = pts[np.argmax(s)]      # Bottom-Right
    diff = np.diff(pts, axis=1)
    rect[1] = pts[np.argmin(diff)]   # Top-Right
    rect[2] = pts[np.argmax(diff)]   # Bottom-Left
    return rect

def encontrar_grade_bolinhas(warped_thresh, dW=600, dH=450):
    """
    Tenta autodetectar os círculos das alternativas por contornos.
    Caso não ache todos, gera a grade por porcentagem proporcional.
    """
    contours, _ = cv2.findContours(warped_thresh, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    
    bolinhas = []
    for cnt in contours:
        x, y, w, h = cv2.boundingRect(cnt)
        ar = w / float(h)
        # Filtra objetos pequenos com formato próximo ao de um círculo/quadrado
        if 14 <= w <= 36 and 14 <= h <= 36 and 0.75 <= ar <= 1.25:
            cx, cy = x + w // 2, y + h // 2
            bolinhas.append((cx, cy))

    # Se encontrou a maioria das bolinhas (ao menos 35 de 50)
    if len(bolinhas) >= 35:
        col1 = [b for b in bolinhas if b[0] < dW // 2]
        col2 = [b for b in bolinhas if b[0] >= dW // 2]

        if len(col1) >= 15 and len(col2) >= 15:
            col1_sorted = sorted(col1, key=lambda b: (b[1], b[0]))
            col2_sorted = sorted(col2, key=lambda b: (b[1], b[0]))
            return col1_sorted, col2_sorted

    # FALLBACK: Grade Proporcional Automática baseada na proporção da folha (%)
    x1_base, y1_base = int(dW * 0.16), int(dH * 0.22)
    x2_base, y2_base = int(dW * 0.58), int(dH * 0.22)
    spX, spY = int(dW * 0.055), int(dH * 0.115)

    grade_q1_5 = [(x1_base + (i * spX), y1_base + (q * spY)) for q in range(5) for i in range(5)]
    grade_q6_10 = [(x2_base + (i * spX), y2_base + (q * spY)) for q in range(5) for i in range(5)]

    return grade_q1_5, grade_q6_10


@app.get("/", response_class=HTMLResponse)
async def home():
    with open("index.html", "r", encoding="utf-8") as f:
        return f.read()


@app.post("/corrigir")
async def corrigir_gabarito(
    file: UploadFile = File(...),
    gabarito: str = Form("BDCBCDCBAB")
):
    contents = await file.read()
    nparr = np.frombuffer(contents, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    if img is None:
        return {"sucesso": False, "mensagem": "Erro ao carregar a imagem capturada."}

    # 1. Pré-processamento
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    blur = cv2.GaussianBlur(gray, (5, 5), 0)
    thresh = cv2.adaptiveThreshold(blur, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 51, 11)

    # 2. Localiza os 4 marcadores das pontas
    contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    anchors = []
    for cnt in contours:
        peri = cv2.arcLength(cnt, True)
        approx = cv2.approxPolyDP(cnt, 0.04 * peri, True)
        if len(approx) == 4:
            x, y, w, h = cv2.boundingRect(approx)
            if 300 < (w * h) < 60000 and 0.7 < (w / float(h)) < 1.3:
                M = cv2.moments(cnt)
                if M["m00"] != 0:
                    anchors.append([int(M["m10"] / M["m00"]), int(M["m01"] / M["m00"])])

    if len(anchors) != 4:
        return {"sucesso": False, "mensagem": "⚠️ Os 4 cantos do gabarito não foram identificados. Tente aproximar ou focar a câmera."}

    # 3. Retificação de perspectiva
    pts_origem = ordenar_pontos(anchors)
    dW, dH = 600, 450
    pts_destino = np.float32([[0, 0], [dW, 0], [0, dH], [dW, dH]])
    M_trans = cv2.getPerspectiveTransform(pts_origem, pts_destino)

    warped = cv2.warpPerspective(img, M_trans, (dW, dH))
    warped_gray = cv2.cvtColor(warped, cv2.COLOR_BGR2GRAY)
    _, warped_thresh = cv2.threshold(
        cv2.GaussianBlur(warped_gray, (3, 3), 0), 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU
    )

    # 4. AUTODETECÇÃO DAS POSIÇÕES DAS BOLINHAS
    grade_c1, grade_c2 = encontrar_grade_bolinhas(warped_thresh, dW, dH)

    acertos = 0
    respostas_aluno = []

    # 5. Avaliação das 10 Questões
    for q in range(10):
        is_col2 = q >= 5
        grade_atual = grade_c2 if is_col2 else grade_c1
        offset_q = (q - 5) if is_col2 else q

        valores_alternativas = []
        coords = []

        for i in range(5):
            idx_bolinha = offset_q * 5 + i
            if idx_bolinha < len(grade_atual):
                cx, cy = grade_atual[idx_bolinha]
            else:
                cx, cy = 0, 0

            coords.append((cx, cy))

            # Mede o preenchimento na região central da bolinha (ROI 20x20px)
            if 10 <= cy < dH - 10 and 10 <= cx < dW - 10:
                roi = warped_thresh[cy-10:cy+10, cx-10:cx+10]
                total_pixels = cv2.countNonZero(roi)
            else:
                total_pixels = 0

            valores_alternativas.append(total_pixels)

        # Análise de pico de preenchimento
        idx_marcado = np.argmax(valores_alternativas)
        max_pixels = valores_alternativas[idx_marcado]
        
        outras_alts = [v for idx, v in enumerate(valores_alternativas) if idx != idx_marcado]
        media_outras = np.mean(outras_alts) if outras_alts else 0

        # Validação se a bolinha foi realmente preenchida
        if max_pixels > 90 and max_pixels > (media_outras * 1.6):
            resposta_aluno = LETRAS[idx_marcado]
        else:
            resposta_aluno = "-"  # Rasura ou Não Preenchida

        respostas_aluno.append(resposta_aluno)

        # Desenha marcadores na imagem de retorno
        cor_resposta = (0, 255, 0) if (q < len(gabarito) and resposta_aluno == gabarito[q]) else (0, 0, 255)
        for i, (cx, cy) in enumerate(coords):
            if cx > 0 and cy > 0:
                if i == idx_marcado and resposta_aluno != "-":
                    cv2.circle(warped, (cx, cy), 6, cor_resposta, -1)
                else:
                    cv2.circle(warped, (cx, cy), 3, (200, 200, 200), -1)

        if q < len(gabarito) and resposta_aluno == gabarito[q]:
            acertos += 1

    nota = (acertos / 10.0) * 10.0

    # Converte imagem processada para envio via JSON
    _, buffer = cv2.imencode('.jpg', warped)
    warped_b64 = base64.b64encode(buffer).decode('utf-8')

    return {
        "sucesso": True,
        "nota": nota,
        "acertos": acertos,
        "respostas": "".join(respostas_aluno),
        "imagem_warped": f"data:image/jpeg;base64,{warped_b64}"
    }
