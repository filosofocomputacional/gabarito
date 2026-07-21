// ================= 1. INICIALIZAÇÃO E ESCOPO GLOBAL =================
window.cvReady = false;

window.Module = {
    onRuntimeInitialized: function() {
        window.cvReady = true;
        console.log("OpenCV.js Carregado com sucesso!");
        const statusEl = document.getElementById('statusCv');
        if (statusEl) {
            statusEl.innerText = "✅ Motor de visão computacional pronto!";
            statusEl.style.background = "#d4edda";
            statusEl.style.color = "#155724";
            setTimeout(() => { statusEl.style.display = 'none'; }, 2000);
        }
        const btnCap = document.getElementById('btnCapturarModelo');
        if (btnCap) btnCap.disabled = false;
    }
};

const LETRAS_TODAS = ["A", "B", "C", "D", "E"];
const defaultGabarito = ['B','D','C','B','C','D','C','B','A','B'];
const sliders = ['x1', 'y1', 'x2', 'y2', 'spX', 'spY'];

const DADOS_ALUNOS = {
    "Ensino Fundamental": {
        "801": [
            "AGATHA LAVINIA OLIVEIRA DA SILVA",
            "ARTHUR FERREIRA DOS SANTOS",
            "BEATRIZ SOUZA LIMA"
        ],
        "802": [
            "CAIO HENRIQUE ALMEIDA",
            "DANIELA CASTRO ROCHA"
        ]
    },
    "Ensino Médio": {
        "1001": [
            "ENZO GABRIEL RIBEIRO",
            "GABRIELA MARTINS COSTA"
        ],
        "2001": [
            "HUGO GUIMARAES PINTO",
            "ISABELA SILVEIRA RAMOS"
        ]
    }
};

let alunoAtualParaCaptura = null;
let bancoNotasLocais = JSON.parse(localStorage.getItem('corrigePro_notas_alunos')) || {};
let streamVideoGlobal = null;
let imagemBaseWarpedCanvas = document.createElement('canvas');
let jaDigitalizado = false;

// ================= 2. COOKIES E CALIBRAGEM =================
function setCookie(name, value, days) {
    let expires = "";
    if (days) {
        let date = new Date();
        date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
        expires = "; expires=" + date.toUTCString();
    }
    document.cookie = name + "=" + (JSON.stringify(value) || "") + expires + "; path=/";
}

function getCookie(name) {
    let nameEQ = name + "=";
    let ca = document.cookie.split(';');
    for (let i = 0; i < ca.length; i++) {
        let c = ca[i];
        while (c.charAt(0) == ' ') c = c.substring(1, c.length);
        if (c.indexOf(nameEQ) == 0) {
            try { return JSON.parse(c.substring(nameEQ.length, c.length)); } catch(e){}
        }
    }
    return null;
}

function carregarCalibracaoCookie() {
    const cookie = getCookie('corrigePro_calib_v1');
    return cookie || { x1: 100, y1: 104, x2: 356, y2: 105, spX: 33, spY: 51, numOpcoes: 5, gabarito: defaultGabarito };
}

let configCalib = carregarCalibracaoCookie();

window.salvarCalibracaoCookie = function() {
    const numOpcoes = parseInt(document.getElementById('selectNumOpcoes').value) || 5;
    const config = { numOpcoes: numOpcoes, gabarito: [] };
    
    sliders.forEach(s => config[s] = parseInt(document.getElementById(`input_${s}`).value));
    for (let i = 0; i < 10; i++) {
        const el = document.getElementById(`qc_${i}`);
        config.gabarito.push(el ? el.value : "A");
    }
    
    setCookie('corrigePro_calib_v1', config, 365);
    configCalib = config;
    alert("✅ Calibragem e Gabarito salvos com sucesso nos Cookies!");
};

function renderizarGridGabarito() {
    const container = document.getElementById('containerGabaritoCalib');
    if (!container) return;

    const numOpcoes = parseInt(document.getElementById('selectNumOpcoes').value) || 5;
    const letrasAtivas = LETRAS_TODAS.slice(0, numOpcoes);

    container.innerHTML = "";
    for (let i = 0; i < 10; i++) {
        let gabVal = configCalib.gabarito?.[i] || defaultGabarito[i];
        if (!letrasAtivas.includes(gabVal)) gabVal = "A";

        container.innerHTML += `<div>
            <label>Q${(i+1).toString().padStart(2, '0')}: </label>
            <select id="qc_${i}">
                ${letrasAtivas.map(l => `<option value="${l}" ${l === gabVal ? 'selected' : ''}>${l}</option>`).join('')}
            </select>
        </div>`;
    }
}

function desenharPreviewAjuste() {
    if (!imagemBaseWarpedCanvas.width) return;

    const canvas = document.getElementById('canvasCalibPreview');
    if (!canvas) return;

    canvas.width = 600; canvas.height = 450;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(imagemBaseWarpedCanvas, 0, 0);

    const v_x1 = parseInt(document.getElementById('input_x1').value);
    const v_y1 = parseInt(document.getElementById('input_y1').value);
    const v_x2 = parseInt(document.getElementById('input_x2').value);
    const v_y2 = parseInt(document.getElementById('input_y2').value);
    const v_spX = parseInt(document.getElementById('input_spX').value);
    const v_spY = parseInt(document.getElementById('input_spY').value);
    const numOpcoes = parseInt(document.getElementById('selectNumOpcoes').value) || 5;

    ctx.strokeStyle = "#ff0000";
    ctx.lineWidth = 2;

    for (let q = 0; q < 10; q++) {
        let isCol2 = q >= 5;
        let colBaseX = isCol2 ? v_x2 : v_x1;
        let colBaseY = isCol2 ? v_y2 : v_y1;
        let linhaIdx = isCol2 ? (q - 5) : q;
        let yPonto = colBaseY + (linhaIdx * v_spY);

        for (let i = 0; i < numOpcoes; i++) {
            let xPonto = colBaseX + (i * v_spX);
            ctx.beginPath();
            ctx.arc(xPonto, yPonto, 10, 0, 2 * Math.PI);
            ctx.stroke();
        }
    }
}

// ================= 3. NAVEGAÇÃO E DROPDOWNS =================
window.trocarAba = function(idAba, event) {
    document.querySelectorAll('.tab-content').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    
    document.getElementById(idAba).style.display = 'block';
    if (event && event.target) event.target.classList.add('active');

    if (idAba === 'abaCalibragem') iniciarCamera('webcamCalib');
    if (idAba === 'abaExportar') atualizarListaTurmasAlteradas();
};

function inicializarSelects() {
    const selectEtapa = document.getElementById('selectEtapa');
    if (!selectEtapa) return;
    
    selectEtapa.innerHTML = "";
    Object.keys(DADOS_ALUNOS).forEach(etapa => {
        selectEtapa.innerHTML += `<option value="${etapa}">${etapa}</option>`;
    });
    carregarTurmas();
}

window.carregarTurmas = function() {
    const etapa = document.getElementById('selectEtapa').value;
    const selectTurma = document.getElementById('selectTurma');
    if (!selectTurma) return;

    selectTurma.innerHTML = "";
    if (DADOS_ALUNOS[etapa]) {
        Object.keys(DADOS_ALUNOS[etapa]).forEach(turma => {
            selectTurma.innerHTML += `<option value="${turma}">Turma ${turma}</option>`;
        });
    }
    carregarAlunos();
};

window.carregarAlunos = function() {
    const etapa = document.getElementById('selectEtapa').value;
    const turma = document.getElementById('selectTurma').value;
    const tbody = document.getElementById('listaAlunosBody');
    if (!tbody) return;

    tbody.innerHTML = "";
    const lista = DADOS_ALUNOS[etapa]?.[turma] || [];
    
    if (lista.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;">Nenhum aluno encontrado nesta turma.</td></tr>';
        return;
    }

    lista.forEach(aluno => {
        const chaveNota = `${turma}_${aluno}`;
        const notaSalva = bancoNotasLocais[chaveNota] !== undefined ? bancoNotasLocais[chaveNota].toFixed(1) : "---";
        const temNotaClass = bancoNotasLocais[chaveNota] !== undefined ? "tem-nota" : "";

        tbody.innerHTML += `
            <tr>
                <td><strong>${aluno}</strong></td>
                <td style="text-align:center;">
                    <button class="btn-cam" onclick="abrirModalScan('${aluno}', '${turma}')">📷</button>
                </td>
                <td style="text-align:center;">
                    <span class="nota-badge ${temNotaClass}">${notaSalva}</span>
                </td>
            </tr>
        `;
    });
};

// ================= 4. CÂMERA E MODAL DE CORREÇÃO =================
function iniciarCamera(elementId) {
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } } })
            .then(stream => {
                streamVideoGlobal = stream;
                const videoEl = document.getElementById(elementId);
                if (videoEl) videoEl.srcObject = stream;
            })
            .catch(err => console.log("Acesso à câmera negado ou indisponível:", err));
    }
}

window.abrirModalScan = function(aluno, turma) {
    alunoAtualParaCaptura = { nome: aluno, turma: turma };
    jaDigitalizado = false;

    document.getElementById('nomeAlunoModal').innerText = `Provas de: ${aluno}`;
    document.getElementById('webcamScan').style.display = 'block';
    document.getElementById('canvasScanResult').style.display = 'none';
    document.getElementById('notaBannerModal').style.display = 'none';
    
    const btnEsc = document.getElementById('btnEscanearAluno');
    btnEsc.innerText = "📸 ESCANEAR E SALVAR NOTA";
    btnEsc.style.background = "var(--success)";

    document.getElementById('modalCamera').style.display = 'flex';
    iniciarCamera('webcamScan');
};

window.fecharModalCamera = function() {
    document.getElementById('modalCamera').style.display = 'none';
    if (streamVideoGlobal) streamVideoGlobal.getTracks().forEach(track => track.stop());
    carregarAlunos();
};

function processarPerspectivaCompleta(src) {
    let gray = new cv.Mat(), blurred = new cv.Mat(), thresh = new cv.Mat(), morphed = new cv.Mat();
    let kernel = null, contours = new cv.MatVector(), hierarchy = new cv.Mat();

    try {
        cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);
        cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0, 0, cv.BORDER_DEFAULT);
        cv.adaptiveThreshold(blurred, thresh, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY_INV, 11, 2);

        kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3));
        cv.morphologyEx(thresh, morphed, cv.MORPH_CLOSE, kernel);

        cv.findContours(morphed, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
        
        let anchors = [];
        for (let i = 0; i < contours.size(); i++) {
            let cnt = contours.get(i);
            let peri = cv.arcLength(cnt, true);
            let approx = new cv.Mat();
            cv.approxPolyDP(cnt, approx, 0.04 * peri, true);

            if (approx.rows === 4) {
                let rect = cv.boundingRect(approx);
                let area = rect.width * rect.height;
                let ar = rect.width / rect.height;
                if (area > 300 && area < 60000 && ar > 0.7 && ar < 1.3) {
                    let M = cv.moments(cnt);
                    if (M.m00 !== 0) anchors.push({ x: Math.round(M.m10 / M.m00), y: Math.round(M.m01 / M.m00) });
                }
            }
            approx.delete(); cnt.delete();
        }

        if (anchors.length !== 4) return null;

        let sum = anchors.map(p => p.x + p.y);
        let diff = anchors.map(p => p.y - p.x);
        let tl = anchors[sum.indexOf(Math.min(...sum))], br = anchors[sum.indexOf(Math.max(...sum))];
        let tr = anchors[diff.indexOf(Math.min(...diff))], bl = anchors[diff.indexOf(Math.max(...diff))];

        let srcComPontos = src.clone();
        let dW = 600, dH = 450;
        let srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [tl.x, tl.y, tr.x, tr.y, bl.x, bl.y, br.x, br.y]);
        let dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, dW, 0, 0, dH, dW, dH]);
        let M_warp = cv.getPerspectiveTransform(srcTri, dstTri);

        let warped = new cv.Mat();
        cv.warpPerspective(src, warped, M_warp, new cv.Size(dW, dH));

        srcTri.delete(); dstTri.delete(); M_warp.delete();
        return { warped, srcComPontos };
    } finally {
        gray.delete(); blurred.delete(); thresh.delete(); morphed.delete();
        if (kernel) kernel.delete();
        contours.delete(); hierarchy.delete();
    }
}

// ================= 5. EXPORTAÇÃO E GERENCIAMENTO =================
function atualizarListaTurmasAlteradas() {
    const ul = document.getElementById('listaTurmasAlteradas');
    if (!ul) return;
    ul.innerHTML = "";

    const turmasModificadas = new Set();
    Object.keys(bancoNotasLocais).forEach(chave => {
        const turma = chave.split('_')[0];
        turmasModificadas.add(turma);
    });

    if (turmasModificadas.size === 0) {
        ul.innerHTML = "<li><em>Nenhuma turma possui notas lançadas ainda.</em></li>";
        return;
    }

    turmasModificadas.forEach(turma => {
        let totalAlunosComNota = Object.keys(bancoNotasLocais).filter(k => k.startsWith(turma + "_")).length;
        ul.innerHTML += `<li><strong>Turma ${turma}:</strong> ${totalAlunosComNota} prova(s) corrigida(s)</li>`;
    });
}

window.exportarCSV = function() {
    const turmasModificadas = new Set();
    Object.keys(bancoNotasLocais).forEach(chave => {
        const turma = chave.split('_')[0];
        turmasModificadas.add(turma);
    });

    if (turmasModificadas.size === 0) {
        alert("Nenhuma alteração foi realizada para exportar.");
        return;
    }

    let csvContent = "data:text/csv;charset=utf-8,Etapa;Turma;Nome do Aluno;Nota\n";

    Object.keys(DADOS_ALUNOS).forEach(etapa => {
        Object.keys(DADOS_ALUNOS[etapa]).forEach(turma => {
            if (turmasModificadas.has(turma)) {
                DADOS_ALUNOS[etapa][turma].forEach(aluno => {
                    const chave = `${turma}_${aluno}`;
                    const nota = bancoNotasLocais[chave] !== undefined ? bancoNotasLocais[chave].toFixed(1) : "";
                    csvContent += `"${etapa}";"${turma}";"${aluno}";"${nota}"\n`;
                });
            }
        });
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `notas_corrigidas_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

window.limparTodasNotas = function() {
    const confirmacao = confirm("⚠️ Tem certeza que deseja apagar TODAS as notas salvas até agora?\n\nEsta ação não poderá ser desfeita.");
    if (!confirmacao) return;

    localStorage.removeItem('corrigePro_notas_alunos');
    bancoNotasLocais = {};
    
    carregarAlunos();
    atualizarListaTurmasAlteradas();

    alert("🗑️ Todas as notas foram apagadas com sucesso!");
};

// ================= 6. EVENT LISTENERS APÓS CARREGAR A TELA =================
document.addEventListener('DOMContentLoaded', () => {
    inicializarSelects();

    const selectNumOpcoes = document.getElementById('selectNumOpcoes');
    if (selectNumOpcoes && configCalib.numOpcoes) {
        selectNumOpcoes.value = configCalib.numOpcoes;
    }

    renderizarGridGabarito();

    selectNumOpcoes?.addEventListener('change', () => {
        renderizarGridGabarito();
        desenharPreviewAjuste();
    });

    sliders.forEach(s => {
        const el = document.getElementById(`input_${s}`);
        if (el) {
            if (configCalib[s] !== undefined) el.value = configCalib[s];
            const valEl = document.getElementById(`val_${s}`);
            if (valEl) valEl.innerText = el.value;
            
            el.addEventListener('input', (e) => {
                if (valEl) valEl.innerText = e.target.value;
                desenharPreviewAjuste();
            });
        }
    });

    // BOTÃO CAPTURAR MODELO
    document.getElementById('btnCapturarModelo')?.addEventListener('click', () => {
        if (!window.cvReady) {
            alert("Aguarde o motor de visão computacional (OpenCV) terminar de carregar.");
            return;
        }

        const video = document.getElementById('webcamCalib');
        if (video.videoWidth === 0) {
            alert("Aguarde a câmera carregar na tela...");
            return;
        }

        const canvasHidden = document.getElementById('canvasHidden');
        canvasHidden.width = video.videoWidth; canvasHidden.height = video.videoHeight;
        canvasHidden.getContext('2d').drawImage(video, 0, 0);

        let src = cv.imread(canvasHidden);
        let res = processarPerspectivaCompleta(src);
        src.delete();

        if (res) {
            const canvasOrig = document.getElementById('canvasFotoOriginalAjuste');
            if (canvasOrig) cv.imshow(canvasOrig, res.srcComPontos);
            res.srcComPontos.delete();

            imagemBaseWarpedCanvas.width = 600; imagemBaseWarpedCanvas.height = 450;
            cv.imshow(imagemBaseWarpedCanvas, res.warped);
            res.warped.delete();

            document.getElementById('painelSliders').style.display = 'block';
            desenharPreviewAjuste();
        } else {
            alert("⚠️ Os 4 cantos do gabarito não foram identificados. Tente posicionar a folha inteira no quadro.");
        }
    });

    // BOTÃO ESCANEAR ALUNO
    document.getElementById('btnEscanearAluno')?.addEventListener('click', () => {
        if (jaDigitalizado) {
            fecharModalCamera();
            return;
        }

        if (!window.cvReady || !alunoAtualParaCaptura) {
            alert("O motor OpenCV ainda não está pronto. Aguarde o aviso no topo da tela.");
            return;
        }

        const video = document.getElementById('webcamScan');
        if (video.videoWidth === 0) {
            alert("Aguarde a câmera carregar a imagem...");
            return;
        }

        const canvasHidden = document.getElementById('canvasHidden');
        canvasHidden.width = video.videoWidth; canvasHidden.height = video.videoHeight;
        canvasHidden.getContext('2d').drawImage(video, 0, 0);

        let src = cv.imread(canvasHidden);
        let res = processarPerspectivaCompleta(src);
        src.delete();

        if (!res) {
            alert("⚠️ Os 4 cantos do gabarito não foram identificados. Enquadre melhor a folha.");
            return;
        }

        let warped = res.warped;
        res.srcComPontos.delete();

        let warpedGray = new cv.Mat();
        cv.cvtColor(warped, warpedGray, cv.COLOR_RGBA2GRAY);
        let warpedThresh = new cv.Mat();
        let warpedBlur = new cv.Mat();
        cv.GaussianBlur(warpedGray, warpedBlur, new cv.Size(3, 3), 0);
        cv.threshold(warpedBlur, warpedThresh, 0, 255, cv.THRESH_BINARY_INV + cv.THRESH_OTSU);

        let stringGabarito = configCalib.gabarito.join('');
        let numOpcoes = configCalib.numOpcoes || 5;
        let acertos = 0;
        let respostasLidas = [];

        const LIMIAR_MINIMO_TINTA = 120;
        let greenColor = new cv.Scalar(0, 255, 0, 255);
        let redColor = new cv.Scalar(255, 0, 0, 255);
        let grayColor = new cv.Scalar(200, 200, 200, 255);

        for (let q = 0; q < 10; q++) {
            let isCol2 = q >= 5;
            let colBaseX = isCol2 ? configCalib.x2 : configCalib.x1;
            let colBaseY = isCol2 ? configCalib.y2 : configCalib.y1;
            let linhaIdx = isCol2 ? (q - 5) : q;
            let yPonto = colBaseY + (linhaIdx * configCalib.spY);

            let valoresAlternativas = [];
            let coords = [];

            for (let i = 0; i < numOpcoes; i++) {
                let xPonto = colBaseX + (i * configCalib.spX);
                coords.push({ x: xPonto, y: yPonto });

                let totalPixels = 0;
                if (yPonto >= 12 && yPonto < 450 - 12 && xPonto >= 12 && xPonto < 600 - 12) {
                    let roi = warpedThresh.roi(new cv.Rect(xPonto - 12, yPonto - 12, 24, 24));
                    totalPixels = cv.countNonZero(roi);
                    roi.delete();
                }
                valoresAlternativas.push(totalPixels);
            }

            let ordenados = [...valoresAlternativas].sort((a, b) => b - a);
            let maior = ordenados[0];
            let segundaMaior = ordenados[1];

            let idxMarcado = valoresAlternativas.indexOf(maior);
            let respostaAluno = "-";

            if (maior > LIMIAR_MINIMO_TINTA) {
                if (segundaMaior > LIMIAR_MINIMO_TINTA && segundaMaior > (maior * 0.60)) {
                    respostaAluno = "*";
                } else {
                    let outras = valoresAlternativas.filter((_, idx) => idx !== idxMarcado);
                    let mediaOutras = outras.reduce((a, b) => a + b, 0) / (outras.length || 1);
                    if (maior > (mediaOutras * 1.8)) {
                        respostaAluno = LETRAS_TODAS[idxMarcado];
                    }
                }
            }

            respostasLidas.push(respostaAluno);
            let acertou = (respostaAluno === stringGabarito[q]);
            if (acertou) acertos++;

            coords.forEach((c, idx) => {
                let center = new cv.Point(c.x, c.y);
                if (idx === idxMarcado && respostaAluno !== "-") {
                    let color = acertou ? greenColor : redColor;
                    cv.circle(warped, center, 8, color, -1);
                } else if (respostaAluno === "*" && valoresAlternativas[idx] > LIMIAR_MINIMO_TINTA) {
                    cv.circle(warped, center, 8, redColor, -1);
                } else {
                    cv.circle(warped, center, 3, grayColor, -1);
                }
            });
        }

        let notaFinal = (acertos / 10.0) * 10.0;
        
        const chaveNota = `${alunoAtualParaCaptura.turma}_${alunoAtualParaCaptura.nome}`;
        bancoNotasLocais[chaveNota] = notaFinal;
        localStorage.setItem('corrigePro_notas_alunos', JSON.stringify(bancoNotasLocais));

        cv.imshow('canvasScanResult', warped);
        document.getElementById('webcamScan').style.display = 'none';
        document.getElementById('canvasScanResult').style.display = 'block';

        const banner = document.getElementById('notaBannerModal');
        banner.innerText = `NOTA: ${notaFinal.toFixed(1)} / 10.0 (${acertos} acertos)`;
        banner.style.display = 'block';

        const btnEsc = document.getElementById('btnEscanearAluno');
        btnEsc.innerText = "✅ CONCLUÍDO (FECHAR)";
        btnEsc.style.background = "#007bff";
        jaDigitalizado = true;

        try {
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = audioCtx.createOscillator();
            osc.connect(audioCtx.destination); osc.frequency.value = 800; osc.start(); osc.stop(audioCtx.currentTime + 0.15);
        } catch(e) {}

        if (streamVideoGlobal) streamVideoGlobal.getTracks().forEach(track => track.stop());

        warped.delete(); warpedGray.delete(); warpedBlur.delete(); warpedThresh.delete();
    });
});
