import express, { type Express, type ErrorRequestHandler } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import { CLERK_PROXY_PATH, clerkProxyMiddleware, getClerkProxyHost } from "./middlewares/clerkProxyMiddleware";

const app: Express = express();
app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());
app.use(cors({ credentials: true, origin: false }));
app.use(express.json({ limit: "3mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(clerkMiddleware((req) => ({
  publishableKey: publishableKeyFromHost(getClerkProxyHost(req) ?? "", process.env.CLERK_PUBLISHABLE_KEY),
})));
app.use((req, res, next) => {
  if (["POST", "PATCH", "DELETE", "PUT"].includes(req.method) && req.headers["sec-fetch-site"] === "cross-site") {
    res.status(403).json({ error: "Cross-site requests are not permitted." }); return;
  }
  next();
});

app.use("/api", router);
const errors: ErrorRequestHandler = (error, req, res, _next) => {
  const validation = error?.name === "ZodError";
  const status = validation ? 400 : Number(error?.status) || 500;
  if (status >= 500) req.log.error({ status, name: error?.name }, "Request failed");
  res.status(status >= 400 && status <= 599 ? status : 500).json({
    error: validation ? "Check the supplied fields and try again." :
      status === 500 ? "Something went wrong. Please try again." : error.message,
  });
};
app.use(errors);

export default app;
