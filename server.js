// importar los modulos y dependencias
const express = require("express")  //framework
const { createServer } = require("http") //Modulo de js para instanciar un servidor en la red
const { join } = require("path") //contruir las rutas seguras segun el so
const { Server } = require("socket.io") //importa la libreria

//acoplamos la infraestructura
const app = express()
const server = createServer(app)
const io = new Server(server)

//ruta http tradicional
app.get("/", (req, res) => {
    //cuando el navegador hace un get a la raiz el servidor responde entregando la interfaz front end
    res.sendFile(join(__dirname, "index.html"))
})

//logica de la comunicacion duplex
io.on("connection", (socket) => {
    console.log("Usuario conectado:", socket.id)
    //avisa a todos cuantos usuarios hay conectados
    io.emit("usuarios", io.engine.clientsCount)

    //el servidor es solo un "espejo": recibe el trazo del cliente A
    //y lo retransmite a todos los DEMAS clientes (B, C...) sin guardarlo
    socket.on("dibujar", (trazo) => {
        socket.broadcast.emit("dibujar", trazo)
    })

    //si alguien borra la pizarra, se borra en todos
    socket.on("limpiar", () => {
        socket.broadcast.emit("limpiar")
    })

    socket.on("disconnect", () => {
        console.log("Usuario desconectado:", socket.id)
        io.emit("usuarios", io.engine.clientsCount)
    })
})

//en Render el puerto lo asigna la plataforma (variable PORT); en local usa el 4000
const PORT = process.env.PORT || 4000

//activar el servicio en todas las interfaces de red
server.listen(PORT, "0.0.0.0", () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`)
})
