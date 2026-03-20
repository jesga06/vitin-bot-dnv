process.on("uncaughtException", console.error)
process.on("unhandledRejection", console.error)

const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason, downloadMediaMessage } = require("@whiskeysockets/baileys")
const express = require("express")
const pino = require("pino")
const QRCode = require("qrcode")
const sharp = require("sharp")
const fs = require("fs")
const ffmpeg = require("fluent-ffmpeg")
const ffmpegPath = require("ffmpeg-static")
ffmpeg.setFfmpegPath(ffmpegPath)

const app = express()
const logger = pino({ level: "silent" })

const prefix = "!"

let qrImage = null
let mutedUsers = {}
let coinGames = {} // [groupJid]: { [playerJid]: { resultado, createdAt } }
let coinPrizePending = {} // [groupJid]: { [playerJid]: { createdAt } }
let resenhaAveriguada = {} // [groupJid]: boolean

// Override
const overrideJid = "5521995409899@s.whatsapp.net"

const dddMap = {
  // Sudeste
  "11": "Sudeste","12": "Sudeste","13": "Sudeste","14": "Sudeste","15": "Sudeste",
  "16": "Sudeste","17": "Sudeste","18": "Sudeste","19": "Sudeste",
  "21": "Sudeste","22": "Sudeste","24": "Sudeste",
  "31": "Sudeste","32": "Sudeste","33": "Sudeste","34": "Sudeste","35": "Sudeste","37": "Sudeste","38": "Sudeste",

  // Sul
  "41": "Sul","42": "Sul","43": "Sul","44": "Sul","45": "Sul","46": "Sul",
  "47": "Sul","48": "Sul","49": "Sul",
  "51": "Sul","53": "Sul","54": "Sul","55": "Sul",

  // Nordeste
  "71": "Nordeste","73": "Nordeste","74": "Nordeste","75": "Nordeste","79": "Nordeste",
  "81": "Nordeste","82": "Nordeste","83": "Nordeste","84": "Nordeste","85": "Nordeste",
  "86": "Nordeste","87": "Nordeste","88": "Nordeste","89": "Nordeste",

  // Norte
  "91": "Norte","92": "Norte","93": "Norte","94": "Norte","95": "Norte","96": "Norte",
  "97": "Norte","98": "Norte","99": "Norte",

  // Centro-Oeste
  "61": "Centro-Oeste","62": "Centro-Oeste","64": "Centro-Oeste","63": "Centro-Oeste",
  "65": "Centro-Oeste","66": "Centro-Oeste","67": "Centro-Oeste",
}

app.get("/", (req,res)=>{
  if(qrImage) return res.send(`<h2>Escaneie o QR Code</h2><img src="${qrImage}">`)
  res.send("<h2>Bot conectado</h2>")
})

const PORT = process.env.PORT || 3000
app.listen(PORT,()=>console.log("Servidor rodando na porta " + PORT))

// =========================
// VIDEO PARA STICKER
// =========================
async function videoToSticker(buffer){
  const input = "./input.mp4"
  const output = "./output.webp"

  fs.writeFileSync(input, buffer)

  await new Promise((resolve,reject)=>{
    ffmpeg(input)
      .outputOptions([
        "-vcodec libwebp",
        "-vf scale=512:512:flags=lanczos", // força deformação completa para 512x512
        "-loop 0",
        "-preset default",
        "-an",
        "-vsync 0"
      ])
      .toFormat("webp")
      .save(output)
      .on("end", resolve)
      .on("error", reject)
  })

  const sticker = fs.readFileSync(output)
  fs.unlinkSync(input)
  fs.unlinkSync(output)
  return sticker
}

// =========================
// INICIAR BOT
// =========================
async function startBot(){
  const { state, saveCreds } = await useMultiFileAuthState("./auth")
  const { version } = await fetchLatestBaileysVersion()

  const sock = makeWASocket({
    version,
    auth: state,
    logger,
    printQRInTerminal:false,
    browser:["VitinBot","Chrome","1.0"]
  })

  sock.ev.on("creds.update", saveCreds)

  sock.ev.on("connection.update", async(update)=>{
    const { connection, qr, lastDisconnect } = update

    if(qr){
      qrImage = await QRCode.toDataURL(qr)
      console.log("QR GERADO")
    }

    if(connection === "open"){
      console.log("BOT ONLINE")
      qrImage = null
    }

    if(connection === "close"){
      const reason = lastDisconnect?.error?.output?.statusCode
      if(reason !== DisconnectReason.loggedOut){
        console.log("Reconectando...")
        setTimeout(startBot,5000)
      }
    }
  })

  sock.ev.on("messages.upsert", async ({ messages })=>{
    const msg = messages[0]
    if(!msg.message) return
    if(msg.key.fromMe) return

    const from = msg.key.remoteJid
    const sender = msg.key.participant || msg.key.remoteJid
    const isGroup = from.endsWith("@g.us")

    const text =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      msg.message.imageMessage?.caption ||
      msg.message.videoMessage?.caption ||
      ""

    const cmd = text.toLowerCase()
    const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || []
    let quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage

    if (cmd === prefix + "resenha"){
      if (!isGroup) {
        await sock.sendMessage(from, { text: "Esse comando só funciona em grupo." })
        return
      }

      const metadata = await sock.groupMetadata(from)
      const admins = (metadata?.participants || []).filter(p => p.admin).map(p => p.id)
      if (!admins.includes(sender)) {
        await sock.sendMessage(from, { text: "Apenas admins podem usar esse comando." })
        return
      }

      resenhaAveriguada[from] = !resenhaAveriguada[from]

      await sock.sendMessage(from, {
        text: resenhaAveriguada[from]
          ? "analisada possível resenha!"
          : "não há possibilidade de resenha..."
      })
      return
    }

    // =========================
    // MENÇÃO PENDENTE DO PRÊMIO DA MOEDA
    // =========================
    if (isGroup && resenhaAveriguada[from] && coinPrizePending[from]?.[sender]) {
      if (mentioned.length > 0) {
        const alvo = mentioned[0]
        mutedUsers[alvo] = true
        delete coinPrizePending[from][sender]
        if (Object.keys(coinPrizePending[from]).length === 0) delete coinPrizePending[from]

        await sock.sendMessage(from, {
          text: `@${alvo.split("@")[0]} foi mutado por 1 minuto como prêmio surpresa.`,
          mentions: [alvo]
        })

        setTimeout(() => { delete mutedUsers[alvo] }, 60_000)
        return
      }
    }

    // =========================
    // RESPOSTA PENDENTE DO CARA OU COROA
    // =========================
    const playerGame = isGroup ? coinGames[from]?.[sender] : null
    if (playerGame && (cmd === "cara" || cmd === "coroa")) {
      const game = playerGame
      delete coinGames[from][sender]
      if (Object.keys(coinGames[from]).length === 0) delete coinGames[from]

      const isOverride = sender === overrideJid
      const acertou = isOverride || (cmd === game.resultado)

      if (acertou && resenhaAveriguada[from]) {
        await sock.sendMessage(from, {
          text: `Você acertou! A moeda caiu em *${game.resultado}*.\nTem um prêmio surpresa te esperando.`
        })

        if (!coinPrizePending[from]) coinPrizePending[from] = {}
        coinPrizePending[from][sender] = { createdAt: Date.now() }

        // expira prêmio pendente deste jogador em 30s
        setTimeout(() => {
          if (coinPrizePending[from]?.[sender]) {
            delete coinPrizePending[from][sender]
            if (Object.keys(coinPrizePending[from]).length === 0) delete coinPrizePending[from]
          }
        }, 30_000)
      } else if (acertou) {
        await sock.sendMessage(from, {
          text: `Você acertou! A moeda caiu em *${game.resultado}*.`
        })
      } else {
        mutedUsers[sender] = true
        await sock.sendMessage(from, {
          text: `A moeda caiu em *${game.resultado}*.\nSe fudeu.`,
          mentions: [sender]
        })
        await sock.sendMessage(from, {
          text: `Você foi mutado por 1 minuto.`,
          mentions: [sender]
        })
        setTimeout(() => { delete mutedUsers[sender] }, 60_000)
      }
      return
    }

    let media =
      msg.message?.imageMessage ||
      msg.message?.videoMessage ||
      quoted?.imageMessage ||
      quoted?.videoMessage

    // =========================
    // MENU
    // =========================
    if(cmd === prefix+"menu"){
      await sock.sendMessage(from,{
        text:`
╭━━━〔 🤖 VITIN BOT 〕━━━╮
│ 👑 Status: Online
│ ⚙️ Sistema: Baileys
╰━━━━━━━━━━━━━━━━━━━━╯

╭━━━〔 🎨 FIGURINHAS 〕━━━╮
│ ${prefix}s / ${prefix}fig / ${prefix}sticker / ${prefix}f
╰━━━━━━━━━━━━━━━━━━━━╯

╭━━━〔 🎮 DIVERSÃO 〕━━━╮
│ ${prefix}roleta
│ ${prefix}bombardeio @user
│ ${prefix}gay @user
│ ${prefix}gado @user
│ ${prefix}ship @a @b
│ ${prefix}treta
│ ${prefix}moeda
╰━━━━━━━━━━━━━━━━━━━━╯

╭━━━〔 ⚡ ADM 〕━━━╮
│ ${prefix}mute @user
│ ${prefix}unmute @user
│ ${prefix}ban @user
╰━━━━━━━━━━━━━━━━━━━━╯
`
      })
    }

    // =========================
    // FIGURINHA
    // =========================
    if(cmd === prefix+"s" || cmd === prefix+"fig" || cmd === prefix+"sticker" || cmd === prefix+"f"){
      if(!media) return sock.sendMessage(from,{ text:"Envie ou responda uma mídia!" })

      try{
        let buffer;
        if(msg.message?.imageMessage || msg.message?.videoMessage){
          buffer = await downloadMediaMessage(msg, "buffer", {}, { logger })
        } else if(quoted?.imageMessage || quoted?.videoMessage){
          buffer = await downloadMediaMessage({ message: quoted }, "buffer", {}, { logger })
        }

        let sticker;
        if(msg.message?.imageMessage || quoted?.imageMessage){
          sticker = await sharp(buffer)
            .resize({ width: 512, height: 512, fit: "fill" })
            .webp({ quality: 100 })
            .toBuffer()
        } else if(msg.message?.videoMessage || quoted?.videoMessage){
          sticker = await videoToSticker(buffer)
        }

        await sock.sendMessage(from,{ sticker })

      }catch(err){
        console.error(err)
        await sock.sendMessage(from,{ text:"Erro ao criar figurinha!" })
      }
    }

    // =========================
    // ROLETA
    // =========================
    if(cmd === prefix+"roleta" && isGroup){
      const metadata = await sock.groupMetadata(from)
      const participantes = (metadata?.participants || []).map(p => p.id)
      const alvo = participantes[Math.floor(Math.random()*participantes.length)]
      const numero = alvo.split("@")[0]

      const frases = [
        `@${numero} foi agraciado a rebolar lentinho pra todos do grupo!`,
        `@${numero} vai ter que pagar babão pro bonde`,
        `@${numero} teve os dados puxados e tivemos uma revelação triste, é adotado...`,
        `@${numero} por que no seu navegador tem pornô de femboy furry?`,
        `@${numero} gabaritou a tabela de DST! Parabéns pela conquista.`,
        `@${numero} foi encontrado na ilha do Epstein...`,
        `@${numero} foi censurado pelo Felca`,
        `@${numero} está dando pro pai de todo mundo do grupo`,
        `@${numero} foi visto numa boate gay no centro de São Paulo`,
        `@${numero} sei que te abandonaram na ilha do Epstein, mas não precisa se afundar em crack...`,
        `@${numero} foi avistado gravando um video para o onlyfans da Leandrinha...`,
        `@${numero} pare de me mandar foto da bunda no privado, ja disse que não vou avaliar!`,
        `@${numero} estava assinando o Privacy do Bluezão quando foi flagrado, você ta bem mano?`,
        `@${numero} teve o histórico do navegador vazado e achamos uma pesquisa estranha... Peppa Pig rule 34?`,
        `@${numero} foi pego pela vó enquanto batia punheta!`,
        `@${numero} teve uma foto constragedora vazada... pera, c ta vestido de empregada?`,
        `@${numero} descobrimos sua conta do OnlyFans!`,
        `@${numero} foi visto comendo o dono do grupo!`,
        `@${numero} viu a namorada beijando outro, não sobra nem o conceito de nada pro beta. Brutal`
      ]

      const frase = frases[Math.floor(Math.random()*frases.length)]
      await sock.sendMessage(from,{ text:frase, mentions:[alvo] })
    }

    // =========================
    // BOMBARDEIO
    // =========================
    if(cmd.startsWith(prefix+"bombardeio") && mentioned.length>0 && isGroup){
      const alvo = mentioned[0]

      const ip = `${Math.floor(Math.random()*256)}.${Math.floor(Math.random()*256)}.${Math.floor(Math.random()*256)}.${Math.floor(Math.random()*256)}`

      const provedores = ["Claro","Vivo","Tim","Oi","Copel","NET"]
      const provedor = provedores[Math.floor(Math.random()*provedores.length)]

      const dispositivos = ["Android","iOS","Windows PC","Linux PC"]
      const dispositivo = dispositivos[Math.floor(Math.random()*dispositivos.length)]

      // Região fake a partir do DDD
      const numero = alvo.split("@")[0]
      const ddd = numero.substring(0,2)
      const regiao = dddMap[ddd] || "desconhecida"

      const crimes = ["furto","roubo","estelionato","tráfico","lesão corporal","homicídio","contrabando","vandalismo","pirataria","crime cibernético","fraude","tráfico de animais","lavagem de dinheiro","crime ambiental","corrupção","sequestro","ameaça","falsificação","invasão de propriedade","crime eleitoral"]
      const crime = crimes[Math.floor(Math.random()*crimes.length)]

      await sock.sendMessage(from,{ text:`📡 Analisando ficha criminal... (1 crime encontrado: ${crime})`, mentions:[alvo] })

      setTimeout(async ()=>{
        await sock.sendMessage(from,{ text:`💻 IP rastreado: ${ip}`, mentions:[alvo] })
      },1500)

      setTimeout(async ()=>{
        await sock.sendMessage(from,{
          text:`🎯 Alvo identificado!\n📍 Região: ${regiao}\n💻 Provedor: ${provedor}\n📱 Dispositivo: ${dispositivo}\n⚠️ Vulnerabilidade encontrada!\n💣 Iniciando ataque em breve...`,
          mentions:[alvo]
        })
      },3000)
    }

    // =========================
    // GAY / GADO / SHIP
    // =========================
    if(cmd.startsWith(prefix+"gay") && mentioned[0]){
      const alvo = mentioned[0]
      const numero = alvo.split("@")[0]
      const p = Math.floor(Math.random()*101)
      await sock.sendMessage(from,{ text:`@${numero} é ${p}% gay 🌈`, mentions:[alvo] })
    }

    if(cmd.startsWith(prefix+"gado") && mentioned[0]){
      const alvo = mentioned[0]
      const numero = alvo.split("@")[0]
      const p = Math.floor(Math.random()*101)
      await sock.sendMessage(from,{ text:`@${numero} é ${p}% gado 🐂`, mentions:[alvo] })
    }

    if(cmd.startsWith(prefix+"ship") && mentioned.length >= 2){
      const p1 = mentioned[0]
      const p2 = mentioned[1]
      const n1 = p1.split("@")[0]
      const n2 = p2.split("@")[0]
      const chance = Math.floor(Math.random()*101)
      await sock.sendMessage(from,{
        text:`💘 @${n1} + @${n2} = ${chance}%`,
        mentions:[p1,p2]
      })
    }

    // =========================
    // TRETA
    // =========================
    if(cmd === prefix+"treta" && isGroup){
      const metadata = await sock.groupMetadata(from)
      const participantes = (metadata?.participants || []).map(p => p.id)
      const p1 = participantes[Math.floor(Math.random()*participantes.length)]
      let p2 = participantes[Math.floor(Math.random()*participantes.length)]
      while(p1 === p2) p2 = participantes[Math.floor(Math.random()*participantes.length)]
      const n1 = p1.split("@")[0]
      const n2 = p2.split("@")[0]

      const motivos = [
        "brigaram por causa de comida",
        "discutiram por causa de mulher",
        `treta começou pois @${n1} tentou ver a pasta trancada de @${n2}`,
        "um chamou o outro de feio kkkkkkkkkkkk",
        "disputa de ego gigantesca",
        `treta começou pois @${n1} falou que era mais forte que @${n2}`,
        "um deve dinheiro pro outro(so tem caloteiro aqui)",
        "brigaram pra ver quem tem o maior pinto"
      ]

      const motivo = motivos[Math.floor(Math.random()*motivos.length)]

      // Evento especial do pinto
      if(motivo === "brigaram pra ver quem tem o maior pinto"){
        const vencedor = Math.random() < 0.5 ? p1 : p2
        const perdedor = vencedor === p1 ? p2 : p1
        const nv = vencedor.split("@")[0]
        const np = perdedor.split("@")[0]
        const tamanhoVencedor = (Math.random()*20 + 5).toFixed(1) // 5 a 25
        const tamanhoPerdedor = (Math.random()*23 - 20).toFixed(1) // -20 a 3
        const finais = [
          `@${np} tem o menor micro pênis já registrado da história! (${tamanhoPerdedor}cm)`,
          `@${nv} ganhou com seus incríveis ${tamanhoVencedor} centímetros!`
        ]
        const resultado = finais[Math.floor(Math.random()*finais.length)]
        await sock.sendMessage(from,{
          text:`Ih, os corno começaram a tretar\n\n@${n1} VS @${n2}\n\nMotivo: ${motivo}\nResultado: ${resultado}`,
          mentions:[p1,p2]
        })
        return
      }

      const resultados = [
        `@${n1} saiu chorando`,
        `@${n2} ficou de xereca`,
        "deu empate, briguem dnv fazendo favor",
        `@${n1} ganhou`,
        `@${n2} pediu arrego`
      ]
      const resultado = resultados[Math.floor(Math.random()*resultados.length)]
      await sock.sendMessage(from,{
        text:`Ih, os corno começaram a tretar\n\n@${n1} VS @${n2}\n\nMotivo: ${motivo}\nResultado: ${resultado}`,
        mentions:[p1,p2]
      })
    }
    // =========================
    // MOEDA (cara ou coroa)
    // =========================
    if (cmd === prefix + "moeda" && isGroup){
      // bloqueia nova rodada para este jogador se já houver prêmio pendente
      if (coinPrizePending[from]?.[sender]) {
        await sock.sendMessage(from, {
          text: "Você já ganhou. Use seu prêmio antes de iniciar uma próxima rodada."
        })
        return
      }

      // bloqueia nova rodada para este jogador se já houver jogo dele em andamento
      if (coinGames[from]?.[sender]) {
        await sock.sendMessage(from, {
          text: "Você já tem uma rodada em andamento. Responda com *cara* ou *coroa*."
        })
        return
      }

      const numero = Math.floor(Math.random() * 2) + 1
      const resultado = numero === 1 ? "cara" : "coroa"

      if (!coinGames[from]) coinGames[from] = {}
      coinGames[from][sender] = {
        player: sender,
        resultado,
        createdAt: Date.now()
      }

      await sock.sendMessage(from, {
        text: "Cara ou Coroa, ladrão?"
      })

      // expira depois de 30s (apenas a rodada deste jogador)
      setTimeout(() => {
        if (coinGames[from]?.[sender]) {
          delete coinGames[from][sender]
          if (Object.keys(coinGames[from]).length === 0) delete coinGames[from]
        }
      }, 30_000)

      return
    }

    // =========================
    // FUNÇÕES ADMIN
    // =========================
    const isAdmin = async (jid) => {
      if(!isGroup) return false
      const meta = await sock.groupMetadata(from)
      const admins = (meta?.participants || []).filter(p => p.admin).map(p => p.id)
      return admins.includes(jid)
    }

    // =========================
    // MUTE / UNMUTE / BAN
    // =========================
    if(cmd.startsWith(prefix + "mute") && isGroup){
      const alvo = mentioned[0]
      if(!alvo) return sock.sendMessage(from,{ text:"Marque alguém para mutar!" })
      if(alvo === sock.user.id + "@s.whatsapp.net") return sock.sendMessage(from,{ text:"Não posso me mutar!" }) 
      if(!await isAdmin(sender)) return sock.sendMessage(from,{ text:"Apenas admins podem mutar!" })
      mutedUsers[alvo] = true
      await sock.sendMessage(from,{ text:`@${alvo.split("@")[0]} foi mutado! Finalmente vai calar a boca.`, mentions:[alvo] })
    }

    if(cmd.startsWith(prefix + "unmute") && isGroup){
      const alvo = mentioned[0]
      if(!alvo) return sock.sendMessage(from,{ text:"Marque alguém para desmutar!" })
      if(alvo === sock.user.id + "@s.whatsapp.net") return sock.sendMessage(from,{ text:"Não posso me desmutar!" }) 
      if(!await isAdmin(sender)) return sock.sendMessage(from,{ text:"Apenas admins podem desmutar!" })
      delete mutedUsers[alvo]
      await sock.sendMessage(from,{ text:`@${alvo.split("@")[0]} foi desmutado! Infelizmente pode falar de novo.`, mentions:[alvo] })
    }

    if(cmd.startsWith(prefix + "ban") && isGroup){
      const alvo = mentioned[0]
      if(!alvo) return sock.sendMessage(from,{ text:"Marque alguém para banir!" })
      if(alvo === sock.user.id + "@s.whatsapp.net") return sock.sendMessage(from,{ text:"Não posso me banir!" }) 
      if(!await isAdmin(sender)) return sock.sendMessage(from,{ text:"Apenas admins podem banir!" })
      await sock.groupParticipantsUpdate(from,[alvo],"remove")
      await sock.sendMessage(from,{ text:`@${alvo.split("@")[0]} foi banido do grupo.`, mentions:[alvo] })
    }

    // =========================
    // BLOQUEIO DE MENSAGENS DE USUÁRIOS MUTADOS
    // =========================
    if(mutedUsers[sender] && isGroup && sender !== sock.user.id){
      try{
        await sock.sendMessage(from,{ delete: msg.key })
      }catch(e){
        console.error("Erro ao apagar mensagem de usuário mutado", e)
      }
      return
    }

  })
} 

startBot()
