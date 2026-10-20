// importar los modulos y dependencias
const express = require("express")  //framework
const { createServer } = require("http") //Modulo de js para instanciar un servidor en la red
const { join } = require("path") //contruir las rutas seguras segun el so
const { randomBytes } = require("crypto") //para generar claves aleatorias
const { Server } = require("socket.io") //importa la libreria

//acoplamos la infraestructura
const app = express()
const server = createServer(app)
//se sube el limite de tamaño de mensaje (1 MB por defecto) porque la foto del lienzo puede pesar mas
const io = new Server(server, { maxHttpBufferSize: 1e7 })

//en Render el puerto lo asigna la plataforma (variable PORT); en local usa el 4000
const PORT = process.env.PORT || 4000

//claves de los enlaces para compartir (como en Word: "puede editar" / "puede ver")
//en Render se definen como variables de entorno para que no cambien al reiniciar;
//si no existen se generan al azar cada vez que arranca el servidor
const CLAVE_EDITAR = process.env.CLAVE_EDITAR || randomBytes(6).toString("hex")
const CLAVE_VER = process.env.CLAVE_VER || randomBytes(6).toString("hex")

//ruta http tradicional
app.get("/", (req, res) => {
    //cuando el navegador hace un get a la raiz el servidor responde entregando la interfaz front end
    res.sendFile(join(__dirname, "index.html"))
})

//cantidad de usuarios con acceso conectados
function avisarUsuarios() {
    io.emit("usuarios", io.of("/").sockets.size)
}

//antes de aceptar la conexion se revisa la clave del enlace y se asigna el permiso
io.use((socket, next) => {
    const clave = socket.handshake.auth.clave
    if (clave === CLAVE_EDITAR) socket.data.rol = "editor"
    else if (clave === CLAVE_VER) socket.data.rol = "lector"
    else return next(new Error("sin permiso"))
    next()
})

//logica de la comunicacion duplex
io.on("connection", (socket) => {
    const esEditor = socket.data.rol === "editor"
    console.log("Usuario conectado:", socket.id, "como", socket.data.rol)

    //se le dice al cliente que permiso tiene y que enlaces puede compartir
    //(un lector solo puede compartir el enlace de vista)
    socket.emit("permiso", {
        rol: socket.data.rol,
        enlaces: esEditor ? { editar: CLAVE_EDITAR, ver: CLAVE_VER } : { ver: CLAVE_VER }
    })
    avisarUsuarios()

    //sincronizacion para quien entra tarde: el servidor NO guarda el dibujo,
    //le pide al participante conectado mas antiguo una foto de su lienzo
    //y se la reenvia solo al que acaba de llegar
    const veterano = [...io.of("/").sockets.values()].find(s => s.id !== socket.id)
    if (veterano) veterano.emit("pedir-estado", socket.id)

    socket.on("estado", (datos) => {
        if (!datos || typeof datos.destino !== "string") return
        io.to(datos.destino).emit("estado", datos.imagen)
    })

    //el servidor es solo un "espejo": recibe el trazo del cliente A
    //y lo retransmite a todos los DEMAS clientes (B, C...) sin guardarlo.
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

    socket.on("disconnect", () => {
        console.log("Usuario desconectado:", socket.id)
        avisarUsuarios()
    })
})

//activar el servicio en todas las interfaces de red
server.listen(PORT, "0.0.0.0", () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`)
    console.log(`Enlace de edicion: /?clave=${CLAVE_EDITAR}`)
    console.log(`Enlace de vista:   /?clave=${CLAVE_VER}`)
})
