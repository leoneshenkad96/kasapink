import { Router, type IRouter, type NextFunction, type Request, type Response } from "express";
import authRouter from "./auth"; // added auth routes
import erpRouter from "./erp";
import healthRouter from "./health";

const router: IRouter = Router();

const legacyAliases = [
  { method: "POST", pattern: /^\/ingredients$/, target: "/erp/ingredients" },
  {
    method: "PUT",
    pattern: /^\/ingredients\/([^/]+)$/,
    target: "/erp/ingredients/$1",
    targetMethod: "PATCH",
  },
  { method: "POST", pattern: /^\/products$/, target: "/erp/products" },
  {
    method: "PUT",
    pattern: /^\/products\/([^/]+)$/,
    target: "/erp/products/$1",
    targetMethod: "PATCH",
  },
  {
    method: "DELETE",
    pattern: /^\/ingredients\/([^/]+)$/,
    target: "/erp/ingredients/$1",
  },
  {
    method: "DELETE",
    pattern: /^\/products\/([^/]+)$/,
    target: "/erp/products/$1",
  },
  {
    method: "POST",
    pattern: /^\/products\/([^/]+)\/recipe$/,
    target: "/erp/products/$1/recipe",
    targetMethod: "PUT",
  },
  { method: "POST", pattern: /^\/purchases$/, target: "/erp/purchases" },
  { method: "POST", pattern: /^\/sales$/, target: "/erp/sales" },
  { method: "POST", pattern: /^\/stock-counts$/, target: "/erp/stock-counts" },
  { method: "GET", pattern: /^\/finance\/report$/, target: "/erp/finance" },
] as const;

function rewriteLegacyAliases(req: Request, _res: Response, next: NextFunction): void {
  const queryIndex = req.url.indexOf("?");
  const pathname = queryIndex === -1 ? req.url : req.url.slice(0, queryIndex);
  const query = queryIndex === -1 ? "" : req.url.slice(queryIndex);
  const alias = legacyAliases.find(
    (item) => item.method === req.method && item.pattern.test(pathname),
  );

  if (alias) {
    req.url = `${pathname.replace(alias.pattern, alias.target)}${query}`;
    if ("targetMethod" in alias) req.method = alias.targetMethod;
  }
  next();
}

router.use(rewriteLegacyAliases);
router.use(healthRouter);
router.use(authRouter);
router.use(erpRouter);

export default router;
