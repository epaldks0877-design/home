using Workerd = import "/workerd/workerd.capnp";

const config :Workerd.Config = (
  services = [
    (name = "auth-tests", worker = (
      compatibilityDate = "2025-09-01",
      modules = [
        (name = "tests/admin-auth.workerd.js", esModule = embed "admin-auth.workerd.js"),
        (name = "lib/admin-auth.js", esModule = embed "../lib/admin-auth.js")
      ],
      globalOutbound = "no-network"
    )),
    (name = "no-network", network = (allow = []))
  ]
);
