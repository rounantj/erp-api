"use strict";
exports.__esModule = true;
var jwt_1 = require("@nestjs/jwt");
function execute(secret, sub) {
    var jwtService = new jwt_1.JwtService({ secret: secret });
    var result = jwtService.sign({ sub: sub });
    console.log('TOKEN\n', result);
}
execute(process.argv[2], process.argv[3]);
