// Module « Arko » pour Mon Hub : présente Arko et l'ouvre dans un onglet Chrome intégré (Custom Tab).
// Arko est une appli web : elle tourne dans Chrome, qui sait lire et encoder la vidéo (WebCodecs).
// À copier dans lib/modules/arko/ecran_arko.dart, puis à brancher dans le catalogue et le registre des modules.

import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

/// Adresse d'Arko publiée sur GitHub Pages. À remplacer par la vraie adresse une fois Arko en ligne.
const String adresseArko = 'https://arko-video.github.io/arko/';

class EcranArko extends StatelessWidget {
  const EcranArko({super.key});

  Future<void> _ouvrir(BuildContext context) async {
    var ouvert = false;
    try {
      ouvert = await launchUrl(Uri.parse(adresseArko), mode: LaunchMode.inAppBrowserView);
    } catch (_) {
      ouvert = false;
    }
    if (!ouvert && context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Impossible d'ouvrir Arko. Vérifie ta connexion internet.")),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(title: const Text('Arko')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            Text('Monte tes clips de jeu en TikTok', style: theme.textTheme.headlineSmall),
            const SizedBox(height: 12),
            const Text(
              'Arko est un éditeur vidéo gratuit et open source, pensé pour TikTok : '
              'couper, passer à la verticale, ajouter une accroche, des sous-titres automatiques, '
              'des sons et des transitions. Tes vidéos restent sur ton téléphone.',
            ),
            const SizedBox(height: 24),
            FilledButton.icon(
              onPressed: () => _ouvrir(context),
              icon: const Icon(Icons.movie_edit),
              label: const Text('Ouvrir Arko'),
            ),
            const SizedBox(height: 12),
            Text(
              "Astuce : dans Arko, touche le menu ⋮ de Chrome puis « Ajouter à l'écran d'accueil » "
              "pour l'avoir comme une vraie appli.",
              style: theme.textTheme.bodySmall,
            ),
          ],
        ),
      ),
    );
  }
}
