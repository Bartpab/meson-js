#!/usr/bin/env python
# -*- coding: utf-8 -*-

import sys
import logging
import MesonPy

from logging.handlers import RotatingFileHandler

from MesonPy.BackendApplication import BackendApplication

import asyncio
import websockets

# cr�ation de l'objet logger qui va nous servir � �crire dans les logs
logger = logging.getLogger()
# on met le niveau du logger � DEBUG, comme �a il �crit tout
logger.setLevel(logging.DEBUG)

# cr�ation d'un formateur qui va ajouter le temps, le niveau
# de chaque message quand on �crira un message dans le log
formatter = logging.Formatter('%(asctime)s :: %(levelname)s :: %(message)s')
# cr�ation d'un handler qui va rediriger une �criture du log vers
# un fichier en mode 'append', avec 1 backup et une taille max de 1Mo
file_handler = RotatingFileHandler('backend.log', 'a', 1000000, 1)
# on lui met le niveau sur DEBUG, on lui dit qu'il doit utiliser le formateur
# cr�� pr�c�dement et on ajoute ce handler au logger
file_handler.setLevel(logging.DEBUG)
file_handler.setFormatter(formatter)
logger.addHandler(file_handler)

def on_crash(type, value, tb):
    logger.error('%s: %s - %s', type, value, tb)
    sys.__excepthook__(type, value, tb)

if __name__ == '__main__':
    app = BackendApplication(
        id="org.meson.test", 
        server_secret="test_server", 
        client_secret="test_client"
    )

    rpcService = app.getContext().getSharedService('com.rpc')

    rpcService.register('hello', lambda __session__: print('hello world from {}'.format(__session__.id)))
    rpcService.register('add2', lambda x, y: x + y)

    app.init()
