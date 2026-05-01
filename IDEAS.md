🔥 Quick wins (peu de dev, fort impact)
Repos récents — Au démarrage, proposer les derniers projets ouverts en un clic. Actuellement on repasse par le sélecteur à chaque lancement.

Autosave — Sauvegarder automatiquement après quelques secondes d'inactivité. Un designer peu habitué aux IDEs va perdre son travail tôt ou tard.

Compteur de tokens — Afficher "≈ 1 200 tokens" dans l'éditeur. Les non-devs ne savent pas pourquoi leur CLAUDE.md trop long fait buguer l'agent.

Renommer / supprimer des fichiers — On peut créer mais pas renommer ni supprimer sans ouvrir le Finder.

Validation MCP — Avertir si le binaire d'un serveur stdio n'est pas trouvé sur le PATH avant de sauvegarder dans .mcp.json.

🎯 Features à valeur forte
Templates d'agents — À la création d'un fichier, proposer des templates (agent design, agent QA, agent généraliste) avec les sections pré-remplies. Les non-devs ne savent pas par quoi commencer.

Catalogue MCP — Comme les skills, un catalogue des MCPs courants (Figma, GitHub, Filesystem, Notion…) avec installation en un clic. C'est le point d'entrée le plus magique pour les designers.

Désinstaller une skill — On peut installer depuis l'interface mais pas désinstaller. Les utilisateurs sont bloqués.

Persistance de l'état — Rouvrir l'app sur le dernier repo et fichier ouvert. Essentiel pour un outil de productivité quotidien.

Notifications du terminal en background — Badge sur l'icône Terminal quand l'agent a fini ou attend une réponse, sans avoir à basculer de vue.

🚀 Horizon moyen terme
Détection des outils selon le projet — Si .claude/ existe → mettre Claude Code en avant automatiquement. Rendre l'app contextuelle au projet ouvert.

Recherche full-text — Chercher dans tous les fichiers agents ouverts (Cmd+P style). Indispensable quand le projet grossit.

Mode prompt rapide — Un champ au-dessus du terminal pour envoyer une instruction sans interagir avec le PTY manuellement. Abaisse encore la barrière pour les non-devs.

Détection d'autres conventions — .cursor/rules/, .windsurfrules, .github/copilot-instructions.md ne sont pas encore scannés. Un designer avec Cursor ne voit rien à l'ouverture.

Export de config — Partager un "pack" agents + skills + MCP sous forme de zip ou lien pour l'équipe.