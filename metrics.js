// NOME DO ARQUIVO: metrics.js (Salvar na raiz do projeto)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, doc, setDoc, increment, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// ==========================================
// 1. CREDENCIAIS DO FIREBASE (SUBSTITUA PELAS DO SEU NOVO PROJETO)
// ==========================================
const firebaseConfig = {
  apiKey: "SUA_API_KEY_AQUI",
  authDomain: "seu-projeto-vida-plena.firebaseapp.com",
  projectId: "seu-projeto-vida-plena",
  storageBucket: "seu-projeto-vida-plena.firebasestorage.app",
  messagingSenderId: "SEU_SENDER_ID",
  appId: "SEU_APP_ID"
};

// Inicializa o Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ==========================================
// 2. IDENTIFICAÇÃO DO ARTIGO (VIA CRAC-HÁ META TAG)
// ==========================================
function getPostSlug() {
    const metaTag = document.querySelector('meta[name="post-slug"]');
    if (metaTag) return metaTag.getAttribute('content');
    
    // Fallback caso esteja na home ou sem tag
    const path = window.location.pathname;
    if (path === '/' || path.endsWith('index.html') && !path.includes('/posts/')) {
        return 'home';
    }
    return 'slug_desconhecido';
}

const currentSlug = getPostSlug();

// ==========================================
// 3. ENGENHARIA DE RASTREAMENTO INTELIGENTE
// ==========================================
async function initAnalytics() {
    // Detecta Modo Local ou Parâmetro de Teste para não sujar o banco oficial
    const urlParams = new URLSearchParams(window.location.search);
    const trackMode = urlParams.get('track');
    
    let shouldTrack = true;
    let dbSlug = currentSlug;
    
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        shouldTrack = false; // Não rastreia testes locais automaticamente
    }
    
    if (trackMode === 'ignorar') shouldTrack = false;
    else if (trackMode === 'teste') dbSlug = currentSlug + "_teste";
    
    if (!shouldTrack) {
        console.log("Analytics em modo offline/teste local.");
        return;
    }

    // Identifica o OS do Usuário do WhatsApp
    const userAgent = navigator.userAgent || navigator.vendor || window.opera;
    let userOS = 'outros';
    if (/iPhone|iPad|iPod|Mac/i.test(userAgent)) userOS = 'apple';
    else if (/Android/i.test(userAgent)) userOS = 'android';
    else if (/Win/i.test(userAgent)) userOS = 'windows';

    // Referências no Firestore (Métricas Acumuladas e Diárias)
    const docRef = doc(db, "analytics", dbSlug);
    const todayStr = new Date().toISOString().split('T')[0];
    const dailyRef = doc(db, "daily_stats", todayStr + "_" + dbSlug);

    try {
        // Inicializa os campos garantindo que o documento exista (Merge)
        await setDoc(docRef, { 
            slug: dbSlug, total_views: increment(0), valid_views: increment(0), 
            os_apple: increment(0), os_android: increment(0), os_windows: increment(0), os_outros: increment(0),
            read_50: increment(0), read_100: increment(0), clicks_vip: increment(0), clicks_wa: increment(0)
        }, { merge: true });

        await setDoc(dailyRef, { date: todayStr, slug: dbSlug, total_views: increment(0), valid_views: increment(0) }, { merge: true });

        // Incrementa o clique bruto e o OS correspondente
        let osUpdate = {};
        osUpdate['os_' + userOS] = increment(1);
        await updateDoc(docRef, { total_views: increment(1), ...osUpdate });
        await updateDoc(dailyRef, { total_views: increment(1) });

        // CONTROLE DE REJEIÇÃO (BOUNCE RATE): Passou 4 segundos? É uma view válida.
        setTimeout(async () => {
            try {
                await updateDoc(docRef, { valid_views: increment(1) });
                await updateDoc(dailyRef, { valid_views: increment(1) });
            } catch (e) { console.error(e); }
        }, 4000);

        // CONTROLE DE SCROLL (50% e 95% do Texto)
        let reached50 = false;
        let reached100 = false;

        window.addEventListener('scroll', async () => {
            const scrollTop = window.scrollY;
            const docHeight = document.body.offsetHeight;
            const winHeight = window.innerHeight;
            const scrollPercent = scrollTop / (docHeight - winHeight);

            if (scrollPercent > 0.5 && !reached50) {
                reached50 = true;
                try { await updateDoc(docRef, { read_50: increment(1) }); } catch(e){}
            }

            if (scrollPercent > 0.95 && !reached100) {
                reached100 = true;
                try { await updateDoc(docRef, { read_100: increment(1) }); } catch(e){}
            }
        });

        // RASTREAMENTO DE CLIQUES EM BOTÕES DE CONVERSÃO
        // Botão de Receber Artigos no Topo (Cabeçalho)
        const vipButtons = document.querySelectorAll('.btn-group-wa');
        vipButtons.forEach(btn => {
            btn.addEventListener('click', async () => {
                try { await updateDoc(docRef, { clicks_vip: increment(1) }); } catch(e){}
            });
        });

        // Botões do Balcão de Negócios (Chamar no WhatsApp ou Comprar Livro)
        const waButtons = document.querySelectorAll('.author-whatsapp-btn, .btn-ad, .btn-buy-book');
        waButtons.forEach(btn => {
            btn.addEventListener('click', async () => {
                try { await updateDoc(docRef, { clicks_wa: increment(1) }); } catch(e){}
            });
        });

    } catch (error) {
        console.error("Erro ao registrar métricas: ", error);
    }
}

document.addEventListener('DOMContentLoaded', initAnalytics);
