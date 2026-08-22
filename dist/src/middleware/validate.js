"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validate = void 0;
const zod_1 = require("zod");
const validate = (schema) => {
    return (req, res, next) => {
        try {
            schema.parse(req.body);
            next();
        }
        catch (error) {
            if (error instanceof zod_1.ZodError) {
                const formattedErrors = error.errors.map((err) => ({
                    field: err.path.join('.'),
                    message: err.message,
                }));
                res.status(400).json({
                    error: 'Erreur de validation',
                    details: formattedErrors,
                });
                return;
            }
            res.status(500).json({ error: 'Erreur interne du serveur' });
            return;
        }
    };
};
exports.validate = validate;
//# sourceMappingURL=validate.js.map