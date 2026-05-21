var http = require("http");
var fs = require("fs");
var path = require("path");

var root = __dirname;
var port = Number(process.env.PORT || 3000);
var types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png"
};

function send(res, status, body, type) {
  res.writeHead(status, {
    "content-type": type || "text/plain; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(body);
}

http.createServer(function (req, res) {
  var pathname = decodeURIComponent(req.url.split("?")[0]);
  var file = pathname === "/" ? "index.html" : pathname.replace(/^\/+/,"");
  var resolved = path.resolve(root, file);

  if (resolved.indexOf(root) !== 0) {
    send(res, 403, "Forbidden");
    return;
  }

  fs.readFile(resolved, function (error, data) {
    if (error) {
      send(res, 404, "Not found");
      return;
    }
    send(res, 200, data, types[path.extname(resolved)] || "application/octet-stream");
  });
}).listen(port, function () {
  console.log("Ray-Ban Walkpad HUD local server: http://localhost:" + port);
});

