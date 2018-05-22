BIN=./node_modules/.bin

all:
	make build
	make build-test

build:
	-make build-ts 
	make dist-es6
	make dist
	make dist-dts

build-dev:
	$(BIN)/tsc --watch --isolatedModules

dist:
	$(BIN)/rollup -c rollup.config.js

dist-es6:
	$(BIN)/rollup -c rollup-es6.config.js

dist-shims:
	$(BIN)/rollup -c rollup-shims.config.js

build-ts:
	tsc

build-ts-watch:
	tsc --watch

dist-dts:
	# TODO move to dts-bundle.json
	./node_modules/.bin/dts-bundle \
		--name asyncmachine \
		--main build/asyncmachine.d.ts \
		--out asyncmachine-bundle.d.ts

compile:
	$(BIN)/tsc --noEmit --pretty

compile-watch:
	$(BIN)/tsc --watch --noEmit --pretty
	
setup:
	npm install

publish:
	make build
	cd pkg && npm publish

test:
	./node_modules/mocha/bin/mocha \
		test/*.js

test-build:
	-$(BIN)/tsc \
		--isolatedModules \
		--skipLibCheck \
		-p test

test-build-watch:
	-$(BIN)/tsc \
		--isolatedModules \
		--skipLibCheck \
		--watch \
		-p test

test-grep:
	$(BIN)/mocha \
		--grep "$(GREP)"
		test/*.js

test-debug:
	$(BIN)/mocha \
		--debug-brk \
		--grep "$(GREP)" \
		test/*.js

test-grep-debug:
	$(BIN)/mocha \
		--debug-brk \
		--grep "$(GREP)" \
		test/*.js

docs:
	@echo "Cleanup the ./docs folder, but keep ./docs/images"
	$(BIN)/typedoc \
		--out docs/ \
		--ignoreCompilerErrors \
		--name AsyncMachine \
		--theme minimal \
		--excludeNotExported \
		--excludePrivate \
		--readme none \
		--mode file \
		src/asyncmachine.ts

.PHONY: build test docs
