pipeline {
  agent any

  options {
    disableConcurrentBuilds()
    timeout(time: 15, unit: 'MINUTES')
  }

  environment {
    PUBLICACAO = '/publicacao'
  }

  stages {
    stage('Checkout') {
      steps {
        checkout scm
        sh 'git log -1 --format="Commit %h - %s (%an)"'
      }
    }

    stage('Build') {
      steps {
        sh 'echo "Deploy da Vinheria - build ${BUILD_NUMBER}"'
        sh 'for arquivo in servicos/*/*.js; do node --check "$arquivo" || exit 1; echo "OK $arquivo"; done'
        sh 'rm -f vinheria-build-*.tar.gz && tar czf vinheria-build-${BUILD_NUMBER}.tar.gz servicos'
        archiveArtifacts artifacts: "vinheria-build-${BUILD_NUMBER}.tar.gz"
      }
    }

    stage('Testes') {
      steps {
        sh 'node --test testes/jwt.test.js'
        sh 'node testes/integracao.js'
      }
    }

    stage('Deploy') {
      steps {
        sh '''
          VERSAO="build ${BUILD_NUMBER} - commit $(git rev-parse --short HEAD) - $(date '+%d/%m/%Y %H:%M')"
          echo "$VERSAO" > VERSAO_ESPERADA.txt
          for pasta in comum pedidos estoque; do
            mkdir -p "$PUBLICACAO/$pasta"
            cp -R servicos/$pasta/. "$PUBLICACAO/$pasta/"
          done
          for servico in pedidos estoque; do
            echo "$VERSAO" > "$PUBLICACAO/$servico/VERSAO.txt"
          done
          echo "Publicado em $PUBLICACAO:"
          ls -R "$PUBLICACAO"
        '''
      }
    }

    stage('Verificação') {
      steps {
        sh 'node scripts/verificar-deploy.js'
      }
    }
  }

  post {
    success { echo 'Deploy da Vinheria concluído.' }
    failure { echo 'Deploy da Vinheria falhou.' }
  }
}
