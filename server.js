import { createServer } from "http";
import next from "next";
import { Server } from "socket.io";
import { pool } from "./lib/pool.js";
import { decrypt } from "./lib/utils.js";

const dev = process.env.NODE_ENV !== "production";
const hostname = "localhost";
const port = 3000;
// when using middleware `hostname` and `port` must be provided below
const app = next({ dev, hostname, port });
const handler = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer(handler);

  const io = new Server(httpServer);

  io.on("connection", (socket) => {
    const info = socket.handshake.auth;
    const { workSpaceID, userID } = {
      workSpaceID: decrypt(info.workSpaceID).replace(/^"|"$/g, ""),
      userID: decrypt(info.userID).replace(/^"|"$/g, ""),
    };
    socket.join(workSpaceID);

    socket.on("taskupdate", async (id, checked) => {
      // emit to all clients in the same room
      try {
        const sql =
          "INSERT INTO progresses (workspace_id, task_id, is_done, updated_by_user) " +
          "VALUES (?, ?, ?, ?) " +
          "ON DUPLICATE KEY UPDATE is_done = VALUES(is_done), updated_by_user = VALUES(updated_by_user);";
        await pool.execute(sql, [workSpaceID, id, checked, userID]);
      } catch (err) {
        console.error(err);
        return;
      }
      io.to(workSpaceID).emit("taskupdated", { id, checked });
    });
  });

  httpServer
    .once("error", (err) => {
      console.error(err);
      process.exit(1);
    })
    .listen(port, () => {
      console.log(`> Ready on http://${hostname}:${port}`);
    });
});