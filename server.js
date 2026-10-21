// ============================================================
//  SERVIDOR DE LA PIZARRA COMPARTIDA
//  Rol en la practica: ser un "espejo" de alta velocidad.
//  Recibe las coordenadas que dibuja el Cliente A y las reenvia
//  (broadcast) al instante a los Clientes B, C... SIN guardarlas.
// ============================================================

// importar los modulos y dependencias
const express = require("express")  //framework web: sirve la pagina index.html por HTTP
const { createServer } = require("http") //Modulo de js para instanciar un servidor en la red
const { join } = require("path") //contruir las rutas seguras segun el so
const { randomBytes } = require("crypto") //para generar claves aleatorias
const { Server } = require("socket.io") //importa la libreria de WebSockets (tiempo real)

//acoplamos la infraestructura:
//express maneja las peticiones HTTP normales y socket.io se "monta" sobre el mismo
//servidor http, asi la pagina y el WebSocket comparten el mismo puerto
const app = express()
const server = createServer(app)
//se sube el limite de tamaño de mensaje (1 MB por defecto) porque la foto del lienzo puede pesar mas
const io = new Server(server, { maxHttpBufferSize: 1e7 })

//en Render el puerto lo asigna la plataforma (variable PORT); en local usa el 4000
const PORT = process.env.PORT || 4000

//claves de los enlaces para compartir (como en Word: "puede editar" / "puede ver")
//en Render se definen como variables de entorno para que no cambien al reiniciar;
//si no existen se generan al azar cada vez que arranca el servidor
//(randomBytes(6) = 6 bytes al azar -> 12 caracteres hexadecimales)
const CLAVE_EDITAR = process.env.CLAVE_EDITAR || randomBytes(6).toString("hex")
const CLAVE_VER = process.env.CLAVE_VER || randomBytes(6).toString("hex")

//ruta http tradicional
app.get("/", (req, res) => {
    //cuando el navegador hace un get a la raiz el servidor responde entregando la interfaz front end
    res.sendFile(join(__dirname, "index.html"))
})

//cantidad de usuarios con acceso conectados
//io.emit envia el mensaje a TODOS los clientes conectados (incluido el que provoco el cambio)
function avisarUsuarios() {
    io.emit("usuarios", io.of("/").sockets.size)
}

//middleware de socket.io: se ejecuta ANTES de aceptar cada conexion.
//revisa la clave que viene en el enlace y asigna el permiso (rol) al socket
io.use((socket, next) => {
    const clave = socket.handshake.auth.clave //la clave la manda el cliente al conectarse
    if (clave === CLAVE_EDITAR) socket.data.rol = "editor"
    else if (clave === CLAVE_VER) socket.data.rol = "lector"
    else return next(new Error("sin permiso")) //se rechaza la conexion (el cliente recibe connect_error)
    next() //clave valida: se acepta la conexion
})

//logica de la comunicacion duplex
//"connection" se dispara una vez por cada cliente que se conecta;
//"socket" representa la conexion con ESE cliente en particular
io.on("connection", (socket) => {
    const esEditor = socket.data.rol === "editor"
    console.log("Usuario conectado:", socket.id, "como", socket.data.rol)

    //se le dice al cliente que permiso tiene y que enlaces puede compartir
    //(un lector solo puede compartir el enlace de vista)
    //socket.emit envia el mensaje SOLO a este cliente
    socket.emit("permiso", {
        rol: socket.data.rol,
        enlaces: esEditor ? { editar: CLAVE_EDITAR, ver: CLAVE_VER } : { ver: CLAVE_VER }
    })
    avisarUsuarios()

    //sincronizacion para quien entra tarde: el servidor NO guarda el dibujo,
    //le pide al participante conectado mas antiguo una foto de su lienzo
    //y se la reenvia solo al que acaba de llegar
    //(los sockets se guardan en orden de llegada, por eso el primero distinto al nuevo es el mas antiguo)
    const veterano = [...io.of("/").sockets.values()].find(s => s.id !== socket.id)
    if (veterano) veterano.emit("pedir-estado", socket.id)

    //el veterano responde con la foto; el servidor solo la "pasa de mano" al destino
    socket.on("estado", (datos) => {
        if (!datos || typeof datos.destino !== "string") return //se ignoran mensajes mal formados
        io.to(datos.destino).emit("estado", datos.imagen) //io.to(id) envia solo a ese cliente
    })

    //NUCLEO DE LA PRACTICA:
    //el servidor es solo un "espejo": recibe el trazo del cliente A
    //y lo retransmite a todos los DEMAS clientes (B, C...) sin guardarlo.
    //socket.broadcast.emit = enviar a todos MENOS al que lo mando (A ya lo dibujo en su pantalla)
    //si quien envia es solo lector, se ignora (el permiso se valida aqui, no solo en la pagina)
    socket.on("dibujar", (trazo) => {
        if (!esEditor) return
        socket.broadcast.emit("dibujar", trazo)
    })

    //si alguien borra la pizarra, se borra en todos
    socket.on("limpiar", () => {
        if (!esEditor) return
        socket.broadcast.emit("limpiar")
    })

    //cuando un cliente cierra la pestaña o pierde conexion se actualiza el contador
    socket.on("disconnect", () => {
        console.log("Usuario desconectado:", socket.id)
        avisarUsuarios()
    })
})

//activar el servicio en todas las interfaces de red
//("0.0.0.0" permite que otros equipos de la misma red entren con la IP de esta maquina)
server.listen(PORT, "0.0.0.0", () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`)
    console.log(`Enlace de edicion: /?clave=${CLAVE_EDITAR}`)
    console.log(`Enlace de vista:   /?clave=${CLAVE_VER}`)
})
