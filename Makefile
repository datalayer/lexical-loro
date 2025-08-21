# Copyright (c) 2023-2025 Datalayer, Inc.
# Distributed under the terms of the MIT License.

# Copyright (c) Datalayer, Inc. https://datalayer.io
# Distributed under the terms of the MIT License.

SHELL=/bin/bash

.DEFAULT_GOAL := default

.PHONY: docs

help: ## display this help
	@awk 'BEGIN {FS = ":.*##"; printf "\nUsage:\n  make \033[36m<target>\033[0m\n"} /^[a-zA-Z_-]+:.*?##/ { printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2 } /^##@/ { printf "\n\033[1m%s\033[0m\n", substr($$0, 5) } ' $(MAKEFILE_LIST)

default: help ## default target is help

clean: ## clean
	npm run clean

build: ## build
	npm run build

publish-npm: clean build ## publish-npm
	npm publish
	echo open https://www.npmjs.com/package/@datalayer/lexical-loro

publish-pypi: # publish the pypi package
	git clean -fdx && \
		python -m build
	@exec echo
	@exec echo twine upload ./dist/*-py3-none-any.whl
	@exec echo
	@exec echo https://pypi.org/project/lexical-loro/#history
